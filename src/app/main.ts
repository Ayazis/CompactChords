// App shell: owns state and wires user events to the core, storage and renderers.

import '../ui/style.css';
import example from '../fixtures/example-01.txt?raw';
import { arrange, format, parseSheet, type Arrangement, type SheetDocument } from '../core';
import { sheetFromShared, type SharedSheet } from '../core/importers/tab-site';
import {
  cleanFolderName,
  DEFAULT_PASTE_GROUPS,
  DEFAULT_SHEET_SETTINGS,
  isSettingGroup,
  parseSettings,
  pasteSettings,
  SIZE_RANGE,
  songIdForTitle,
  songIdForUrl,
  type SettingGroup,
  type SheetSettings,
  type StoredSong,
} from '../core/songs';
import { importFromUrl, loadListedSongs, printSheet, type ListedSong } from '../platform';
import { bookmarkletHref, IMPORT_HASH, takeImportPayload } from '../platform/bookmarklet';
import { exportLibrary, importLibrary, putSong, readLibrary, removeSong, updateSongs } from '../platform/library';
import { renderSections, renderSongList, type SongFolder, type SongGroup } from '../ui/panels';
import { DEFAULT_SETTINGS, el, paginate, renderSheet } from '../ui/render';

const EXAMPLE_KEY = 'example';
const LAST_OPENED_KEY = 'compact-chords.last-opened';
const THEME_KEY = 'compact-chords.theme';
const COPIED_KEY = 'compact-chords.copied-settings';
const PASTE_GROUPS_KEY = 'compact-chords.paste-groups';
const COLLAPSED_KEY = 'compact-chords.collapsed-folders';
const DEFAULT_CHORD_COLOR = '#1f3fb0';

interface Song {
  /** Library id: set once saved, or up front for songs from a link. */
  id?: string;
  url?: string;
  folder?: string;
  title: string;
  details: string;
  text: string;
  settings: SheetSettings;
}

interface State {
  song: Song;
  /** The user changed the open song since it was opened or saved. */
  dirty: boolean;
  isExample: boolean;
  library: StoredSong[];
  /** Link lists from the local server; undefined on static hosting. */
  lists?: ListedSong[];
  doc: SheetDocument;
  arrangement?: Arrangement;
  /** Ids of the library songs picked while selecting; undefined when not selecting. */
  selected?: Set<string>;
  /** Last song clicked while selecting, where a Shift+click range starts. */
  selectAnchor?: string;
  collapsed: Set<string>;
  copied?: CopiedSettings;
}

interface CopiedSettings {
  settings: SheetSettings;
  /** Title of the song they were copied from. */
  from: string;
}

const state: State = {
  song: { title: '', details: '', text: '', settings: structuredClone(DEFAULT_SHEET_SETTINGS) },
  dirty: false,
  isExample: false,
  library: readLibrary(),
  doc: { blocks: [] },
  collapsed: new Set(
    readPref(COLLAPSED_KEY, (value) => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : undefined)),
  ),
  copied: readPref(COPIED_KEY, (value) => {
    const copied = value as Partial<CopiedSettings> | null;
    const settings = parseSettings(copied?.settings);
    return settings && typeof copied?.from === 'string' ? { settings, from: copied.from } : undefined;
  }),
};

/** Per-browser conveniences in localStorage; losing them only costs a click. */
function readPref<T>(key: string, parse: (value: unknown) => T | undefined): T | undefined {
  try {
    return parse(JSON.parse(localStorage.getItem(key) ?? 'null'));
  } catch {
    return undefined;
  }
}

function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The preference still applies for this visit.
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const PAGE_CONTENT_MM = 297 - 2 * DEFAULT_SETTINGS.marginMm;
const PX_PER_MM = 96 / 25.4;

const sheet = $<HTMLElement>('sheet');
const sheetPages = $<HTMLElement>('sheet-pages');
const batchPrint = $<HTMLElement>('batch-print');
const frame = $<HTMLElement>('sheet-frame');
const preview = $<HTMLElement>('preview');
const editor = $<HTMLElement>('editor');
const input = $<HTMLTextAreaElement>('input');
const titleInput = $<HTMLInputElement>('title');
const status = $<HTMLElement>('status');
const search = $<HTMLInputElement>('search');
const songList = $<HTMLElement>('song-list');
const sections = $<HTMLElement>('sections');
const keys = $<HTMLElement>('keys');
const pages = $<HTMLElement>('pages');
const capo = $<HTMLSelectElement>('capo');
const chordSize = $<HTMLInputElement>('chord-size');
const lyricSize = $<HTMLInputElement>('lyric-size');
const showTabs = $<HTMLInputElement>('show-tabs');
const keySelect = $<HTMLSelectElement>('key');
const nashville = $<HTMLInputElement>('nashville');
const urlForm = $<HTMLFormElement>('url-form');
const urlInput = $<HTMLInputElement>('url');
const saveButton = $<HTMLButtonElement>('save');
const deleteButton = $<HTMLButtonElement>('delete');
const editToggle = $<HTMLButtonElement>('edit-toggle');
const library = $<HTMLElement>('library');
const settingsPanel = $<HTMLElement>('settings');
const libraryToggle = $<HTMLButtonElement>('toggle-library');
const settingsToggle = $<HTMLButtonElement>('toggle-settings');
const scrim = $<HTMLElement>('scrim');
const sectionGap = $<HTMLInputElement>('section-gap');
const chordColor = $<HTMLInputElement>('chord-color');
const headerText = $<HTMLInputElement>('header-text');
const footerText = $<HTMLInputElement>('footer-text');
const selectButton = $<HTMLButtonElement>('select-songs');
const selectionBar = $<HTMLElement>('selection-bar');
const pasteButton = $<HTMLButtonElement>('paste-settings');
const pasteSelected = $<HTMLButtonElement>('paste-selected');
const moveSelected = $<HTMLButtonElement>('move-selected');
const pasteDialog = $<HTMLDialogElement>('paste-dialog');
const folderDialog = $<HTMLDialogElement>('folder-dialog');
const folderName = $<HTMLInputElement>('folder-name');

// ---------- Status ----------

let statusTimer: number | undefined;
function setStatus(message: string, tone: 'info' | 'ok' | 'error' = 'info'): void {
  status.textContent = message;
  status.className = `status ${tone === 'info' ? '' : tone}`;
  status.title = message;
  window.clearTimeout(statusTimer);
  if (tone !== 'error') statusTimer = window.setTimeout(() => (status.textContent = ''), 6000);
}

// ---------- Rendering ----------

const inLibrary = (id: string | undefined) => id !== undefined && state.library.some((song) => song.id === id);

function headingDetails(song: Song, arrangement: Arrangement | undefined): string {
  const { settings, details } = song;
  const keyInfo = arrangement?.keys;
  return [details, settings.capo ? `Capo ${settings.capo}` : '', keyInfo ? `Key ${keyInfo.sounding}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** Renders a song's sheet into `root` and returns how it was arranged. */
function drawSheet(root: HTMLElement, song: Song, doc = parseSheet(song.text)): Arrangement {
  const arrangement = arrange(doc, song.settings);
  const blocks = format(arrangement.doc, { showTabs: song.settings.showTabs });
  renderSheet(root, blocks, { title: song.title, details: headingDetails(song, arrangement) }, { ...DEFAULT_SETTINGS, ...song.settings });
  return arrangement;
}

/** Renders the open song into the preview pages; returns how many A4 pages it takes. */
function renderSheetView(): number {
  state.doc = parseSheet(state.song.text);
  state.arrangement = drawSheet(sheet, state.song, state.doc);
  return paginate(sheet).length;
}

/** Height of the first page's content in mm, as if the page could grow. */
function contentMm(): number {
  sheet.style.height = 'auto';
  const height = sheet.offsetHeight;
  sheet.style.height = '';
  return height / PX_PER_MM - 2 * DEFAULT_SETTINGS.marginMm;
}

/** Scales the A4 pages down to fit the available width. */
function fitPreview(): void {
  const width = sheetPages.offsetWidth;
  const style = getComputedStyle(preview);
  const available = preview.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
  const scale = Math.min(1, available / width);
  sheetPages.style.transform = scale < 1 ? `scale(${scale})` : '';
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${sheetPages.offsetHeight * scale}px`;
}

function formatShift(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0';
}

function songGroups(): SongGroup[] {
  const summary = (settings: SheetSettings) =>
    [settings.transpose ? formatShift(settings.transpose) : '', settings.capo ? `capo ${settings.capo}` : '']
      .filter(Boolean)
      .join(' · ') || undefined;

  const loose: SongGroup['entries'] = [];
  const folders = new Map<string, SongFolder>();
  for (const song of [...state.library].sort((a, b) => a.title.localeCompare(b.title))) {
    const detail = summary(song.settings);
    const entry = { key: `song:${song.id}`, label: song.title || 'Untitled', ...(detail ? { detail } : {}) };
    if (!song.folder) loose.push(entry);
    else if (folders.has(song.folder)) folders.get(song.folder)!.entries.push(entry);
    else folders.set(song.folder, { name: song.folder, entries: [entry] });
  }
  const sortedFolders = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups: SongGroup[] = [{ name: 'My library', entries: loose, folders: sortedFolders, matchName: false }];
  // Only library songs can be selected, so the other groups step aside meanwhile.
  if (state.selected) return groups;

  const lists = new Map<string, SongGroup>();
  for (const listed of state.lists ?? []) {
    const group = lists.get(listed.list) ?? { name: listed.list, entries: [] };
    lists.set(listed.list, group);
    group.entries.push(
      inLibrary(listed.id)
        ? { key: `song:${listed.id}`, label: listed.label, badge: 'saved' }
        : { key: `link:${listed.url}`, label: listed.label },
    );
  }
  groups.push(...lists.values(), { name: 'Built-in', matchName: false, entries: [{ key: EXAMPLE_KEY, label: 'Paper Lanterns', detail: 'Example song' }] });
  return groups;
}

function activeKey(): string | undefined {
  if (state.isExample) return EXAMPLE_KEY;
  if (inLibrary(state.song.id)) return `song:${state.song.id}`;
  return state.song.url ? `link:${state.song.url}` : undefined;
}

function renderLibrary(): void {
  // Songs removed or replaced by an import drop out of the selection.
  for (const id of state.selected ?? []) if (!inLibrary(id)) state.selected!.delete(id);
  const selected = state.selected && new Set([...state.selected].map((id) => `song:${id}`));
  renderSongList(songList, songGroups(), activeKey(), search.value, { ...(selected ? { selected } : {}), collapsed: state.collapsed });

  selectButton.setAttribute('aria-pressed', String(Boolean(state.selected)));
  selectionBar.hidden = !state.selected;
  const count = state.selected?.size ?? 0;
  $('selection-count').textContent = `${count} selected`;
  pasteSelected.disabled = count === 0 || !state.copied;
  pasteSelected.title = state.copied
    ? `Paste the settings copied from “${state.copied.from}” into the selected songs`
    : 'Copy settings from a sheet first (in the sheet settings)';
  moveSelected.disabled = count === 0;
  pasteButton.disabled = !state.copied;
  pasteButton.title = state.copied ? `Paste settings copied from “${state.copied.from}”` : 'Copy settings from a sheet first';
}

function renderPanels(): void {
  const { settings } = state.song;
  renderLibrary();
  renderSections(
    sections,
    state.doc.blocks,
    new Set(settings.hiddenBlocks),
    new Set(settings.chordlessBlocks),
    new Set(settings.headerOnlyBlocks),
  );

  $('transpose-value').textContent = formatShift(settings.transpose);
  $('chord-size-value').textContent = `${settings.chordPx}px`;
  $('lyric-size-value').textContent = `${settings.lyricPx}px`;
  $('section-gap-value').textContent = `${settings.sectionGap}em`;

  const keyInfo = state.arrangement?.keys;
  const rows: [string, string][] = keyInfo
    ? [
        ['Original', keyInfo.original],
        ...(settings.transpose ? ([['Sounds in', keyInfo.sounding]] as [string, string][]) : []),
        ...(settings.capo ? ([['Play shapes', `${keyInfo.shapes} (capo ${settings.capo})`]] as [string, string][]) : []),
      ]
    : [['Key', '—']];
  keys.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );

  saveButton.classList.toggle('is-dirty', state.dirty);
  saveButton.setAttribute('aria-label', state.dirty ? 'Save (unsaved changes)' : 'Save');
  deleteButton.hidden = state.isExample || !inLibrary(state.song.id);
}

function updatePages(count: number): void {
  pages.textContent = state.doc.blocks.length === 0 ? '' : `${count} A4 page${count === 1 ? '' : 's'}`;
}

/** Re-renders everything, keeping keyboard focus on the same control. */
function refresh(): void {
  const focused = document.activeElement as HTMLElement | null;
  const focusKey = focused?.dataset.focusKey ?? (focused?.dataset.key ? `key:${focused.dataset.key}` : undefined);

  const pageCount = renderSheetView();
  renderPanels();
  updatePages(pageCount);
  fitPreview();

  if (focusKey) {
    const selector = focusKey.startsWith('key:')
      ? `[data-key="${CSS.escape(focusKey.slice(4))}"]`
      : `[data-focus-key="${CSS.escape(focusKey)}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
  }
}

let refreshTimer: number | undefined;
function scheduleRefresh(): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 120);
}

function syncControls(): void {
  const { settings } = state.song;
  capo.value = String(settings.capo);
  chordSize.value = String(settings.chordPx);
  lyricSize.value = String(settings.lyricPx);
  showTabs.checked = settings.showTabs;
  keySelect.value = settings.key;
  nashville.checked = settings.nashville;
  sectionGap.value = String(settings.sectionGap);
  chordColor.value = settings.chordColor === 'auto' ? DEFAULT_CHORD_COLOR : settings.chordColor;
  headerText.value = settings.headerText;
  footerText.value = settings.footerText;
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="accidentals"]')) {
    radio.checked = radio.value === settings.accidentals;
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="columns"]')) {
    radio.checked = Number(radio.value) === settings.columns;
  }
}

function markDirty(): void {
  state.dirty = true;
  saveButton.classList.add('is-dirty');
}

function changeSettings(patch: Partial<SheetSettings>): void {
  state.song.settings = { ...state.song.settings, ...patch };
  markDirty();
  syncControls();
  refresh();
}

// ---------- Opening songs ----------

function confirmDiscard(): boolean {
  return !state.dirty || window.confirm(`Discard unsaved changes to “${state.song.title || 'Untitled song'}”?`);
}

function updateAddress(): void {
  const { id, url } = state.song;
  const query = inLibrary(id) ? `?song=${encodeURIComponent(id!)}` : url ? `?url=${encodeURIComponent(url)}` : '';
  history.replaceState(null, '', (query || location.pathname) + location.hash);
}

function rememberOpened(key: string | undefined): void {
  try {
    if (key) localStorage.setItem(LAST_OPENED_KEY, key);
  } catch {
    // Remembering the last song is a convenience only.
  }
}

function openSong(song: Song, isExample = false): void {
  state.song = { ...song, settings: structuredClone(song.settings) };
  state.dirty = false;
  state.isExample = isExample;
  input.value = song.text;
  titleInput.value = song.title;
  urlInput.value = song.url ?? '';
  syncControls();
  refresh();
  updateAddress();
  rememberOpened(activeKey());
}

function openStored(id: string): boolean {
  const stored = state.library.find((song) => song.id === id);
  if (!stored) return false;
  const { savedAt: _savedAt, ...song } = stored;
  openSong(song);
  setStatus(`Opened “${stored.title}” from your library.`);
  return true;
}

function openExample(): boolean {
  openSong({ title: 'Paper Lanterns', details: 'Example song', text: example, settings: DEFAULT_SHEET_SETTINGS }, true);
  setStatus('Opened the example song.');
  return true;
}

function songFromShared(sheet: SharedSheet): Song {
  const song: Song = {
    title: [sheet.artist, sheet.title].filter(Boolean).join(' – '),
    details: [sheet.capo ? `Capo ${sheet.capo}` : '', sheet.tuning ? `Tuning ${sheet.tuning}` : ''].filter(Boolean).join(' · '),
    text: sheet.text,
    settings: DEFAULT_SHEET_SETTINGS,
  };
  if (sheet.url) {
    song.url = sheet.url;
    // A link without a song path (the site's home page) has no usable id; a title-based one is made on save.
    const id = songIdForUrl(sheet.url);
    if (id) song.id = id;
  }
  return song;
}

/** Opens a link: the library version when saved, otherwise imported through the local server. */
async function openLink(url: string): Promise<boolean> {
  let id: string;
  try {
    id = songIdForUrl(url);
  } catch {
    setStatus('That is not a valid link.', 'error');
    return false;
  }
  if (inLibrary(id)) return openStored(id);

  setStatus('Importing…');
  const button = urlForm.querySelector('button')!;
  button.disabled = true;
  try {
    const imported = await importFromUrl(url);
    openSong(songFromShared({ ...imported, url }));
    setStatus(`Imported “${imported.title ?? 'song'}”. Save it to keep your settings.`, 'ok');
    return true;
  } catch (error) {
    setStatus((error as Error).message, 'error');
    return false;
  } finally {
    button.disabled = false;
  }
}

function openKey(key: string): Promise<boolean> | boolean {
  if (key === EXAMPLE_KEY) return openExample();
  if (key.startsWith('song:')) return openStored(key.slice(5));
  if (key.startsWith('link:')) return openLink(key.slice(5));
  return false;
}

function newSong(): void {
  if (!confirmDiscard()) return;
  openSong({ title: '', details: '', text: '', settings: DEFAULT_SHEET_SETTINGS });
  setEditor(true);
  titleInput.focus();
  setStatus('New song: give it a title and paste or type the chord sheet.');
}

// ---------- Library ----------

function save(): void {
  const title = titleInput.value.trim();
  const id = state.song.id ?? songIdForTitle(title);
  if (!title || !id) {
    setStatus('Give the song a title before saving.', 'error');
    titleInput.focus();
    return;
  }
  if (!state.song.id && inLibrary(id) && !window.confirm(`“${title}” is already in your library. Replace it?`)) return;

  const stored: StoredSong = {
    id,
    title,
    details: state.song.details,
    text: state.song.text,
    settings: structuredClone(state.song.settings),
    savedAt: new Date().toISOString(),
  };
  if (state.song.url) stored.url = state.song.url;
  if (state.song.folder) stored.folder = state.song.folder;
  try {
    state.library = putSong(stored);
  } catch (error) {
    setStatus((error as Error).message, 'error');
    return;
  }
  state.song = { ...state.song, id, title };
  state.dirty = false;
  state.isExample = false;
  refresh();
  updateAddress();
  rememberOpened(activeKey());
  setStatus(`Saved “${title}” to your library.`, 'ok');
}

function deleteCurrent(): void {
  const { id, title } = state.song;
  if (!id || !inLibrary(id)) return;
  if (!window.confirm(`Remove “${title}” from your library? This cannot be undone.`)) return;
  try {
    state.library = removeSong(id);
  } catch (error) {
    setStatus((error as Error).message, 'error');
    return;
  }
  // The open copy is now the only one left.
  state.dirty = true;
  refresh();
  updateAddress();
  setStatus(`Removed “${title}” from your library. It stays open; Save to add it back.`);
}

// ---------- Folders and selection ----------

function toggleFolder(name: string): void {
  if (!state.collapsed.delete(name)) state.collapsed.add(name);
  writePref(COLLAPSED_KEY, [...state.collapsed]);
  renderLibrary();
}

function setSelecting(on: boolean): void {
  state.selected = on ? new Set() : undefined;
  state.selectAnchor = undefined;
  renderLibrary();
}

/** Ids of the selectable songs in list order, for Shift+click ranges. */
const listedIds = () => [...songList.querySelectorAll<HTMLInputElement>('input[data-select]')].map((box) => box.dataset.select!.slice(5));

function selectSong(id: string, on: boolean, range: boolean): void {
  const selected = state.selected!;
  const ids = listedIds();
  const from = state.selectAnchor ? ids.indexOf(state.selectAnchor) : -1;
  const to = ids.indexOf(id);
  const span = range && from >= 0 && to >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
  for (const each of span) {
    if (on) selected.add(each);
    else selected.delete(each);
  }
  state.selectAnchor = id;
  renderLibrary();
}

function selectFolder(name: string, on: boolean): void {
  for (const song of state.library) {
    if (song.folder !== name) continue;
    if (on) state.selected!.add(song.id);
    else state.selected!.delete(song.id);
  }
  renderLibrary();
}

const songCount = (count: number) => `${count} song${count === 1 ? '' : 's'}`;

// jsdom and older browsers lack the modal API; an open attribute still shows the dialog.
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function openFolderDialog(): void {
  const ids = state.selected;
  if (!ids?.size) return;
  const songs = state.library.filter((song) => ids.has(song.id));
  const folders = [...new Set(state.library.map((song) => song.folder).filter((name): name is string => Boolean(name)))].sort();
  $('folder-names').replaceChildren(...folders.map((name) => new Option(name, name)));
  const current = new Set(songs.map((song) => song.folder ?? ''));
  folderName.value = current.size === 1 ? [...current][0]! : '';
  $('folder-summary').textContent = `Move ${songCount(songs.length)}. To rename a folder, select all its songs and type the new name.`;
  openDialog(folderDialog);
  folderName.select();
}

function moveSelectedSongs(): void {
  const ids = state.selected;
  if (!ids?.size) return;
  const name = cleanFolderName(folderName.value);
  try {
    state.library = updateSongs(ids, ({ folder: _folder, ...song }) => (name ? { ...song, folder: name } : song));
  } catch (error) {
    setStatus((error as Error).message, 'error');
    return;
  }
  if (state.song.id && ids.has(state.song.id)) {
    if (name) state.song.folder = name;
    else delete state.song.folder;
  }
  // Show the songs where they went.
  if (state.collapsed.delete(name)) writePref(COLLAPSED_KEY, [...state.collapsed]);
  closeDialog(folderDialog);
  renderLibrary();
  setStatus(name ? `Moved ${songCount(ids.size)} to “${name}”.` : `Took ${songCount(ids.size)} out of their folder.`, 'ok');
}

/** Prints every song of a folder, each with its own settings, one after another. */
function printFolder(name: string): void {
  const songs = state.library
    .filter((song) => song.folder === name)
    .sort((a, b) => a.title.localeCompare(b.title))
    // The open song prints as it is on screen, unsaved changes included.
    .map((song): Song => (song.id === state.song.id ? state.song : song));
  if (songs.length === 0) return;
  batchPrint.replaceChildren();
  batchPrint.hidden = false;
  for (const song of songs) {
    const page = el('article', 'sheet');
    batchPrint.append(page);
    drawSheet(page, song);
    paginate(page);
  }
  document.body.classList.add('batch-printing');
  window.addEventListener('afterprint', endBatchPrint, { once: true });
  setStatus(`Printing ${songCount(songs.length)} from “${name}”.`, 'ok');
  printSheet();
}

function endBatchPrint(): void {
  document.body.classList.remove('batch-printing');
  batchPrint.replaceChildren();
  batchPrint.hidden = true;
}

// ---------- Copying settings between songs ----------

const GROUP_NAMES: Record<SettingGroup, string> = {
  sizes: 'text sizes',
  layout: 'layout',
  banners: 'header & footer',
  key: 'key & capo',
  sections: 'sections',
};

let pasteTarget: 'open' | 'selected' = 'open';
const pasteBoxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="paste-group"]')];

function copySettings(): void {
  state.copied = { settings: structuredClone(state.song.settings), from: state.song.title.trim() || 'Untitled song' };
  writePref(COPIED_KEY, state.copied);
  renderLibrary();
  setStatus(`Copied the settings of “${state.copied.from}”. Paste them into another song, or select songs in the library.`, 'ok');
}

function openPasteDialog(target: typeof pasteTarget): void {
  const copied = state.copied;
  const count = state.selected?.size ?? 0;
  if (!copied || (target === 'selected' && count === 0)) return;
  pasteTarget = target;
  const groups = readPref(PASTE_GROUPS_KEY, (value) => (Array.isArray(value) ? value.filter(isSettingGroup) : undefined)) ?? DEFAULT_PASTE_GROUPS;
  for (const box of pasteBoxes()) box.checked = groups.includes(box.value as SettingGroup);
  const into = target === 'open' ? `“${state.song.title.trim() || 'Untitled song'}”` : songCount(count);
  $('paste-summary').textContent = `From “${copied.from}” into ${into}.`;
  openDialog(pasteDialog);
}

function pasteChosen(): void {
  const copied = state.copied;
  const groups = pasteBoxes()
    .filter((box) => box.checked)
    .map((box) => box.value)
    .filter(isSettingGroup);
  if (!copied || groups.length === 0) {
    setStatus('Choose which settings to paste.', 'error');
    return;
  }
  writePref(PASTE_GROUPS_KEY, groups);
  const what = groups.map((group) => GROUP_NAMES[group]).join(', ');
  closeDialog(pasteDialog);

  if (pasteTarget === 'open') {
    changeSettings(pasteSettings(state.song.settings, copied.settings, groups));
    setStatus(`Pasted ${what}. Save to keep them.`, 'ok');
    return;
  }

  const ids = state.selected ?? new Set<string>();
  const savedAt = new Date().toISOString();
  try {
    state.library = updateSongs(ids, (song) => ({ ...song, settings: pasteSettings(song.settings, copied.settings, groups), savedAt }));
  } catch (error) {
    setStatus((error as Error).message, 'error');
    return;
  }
  // The open song follows its saved copy; its other unsaved edits stay unsaved.
  if (state.song.id && ids.has(state.song.id)) {
    state.song.settings = pasteSettings(state.song.settings, copied.settings, groups);
    syncControls();
  }
  refresh();
  setStatus(`Pasted ${what} into ${songCount(ids.size)}.`, 'ok');
}

// ---------- Layout helpers ----------

function setEditor(open: boolean): void {
  editor.hidden = !open;
  editToggle.setAttribute('aria-pressed', String(open));
  requestAnimationFrame(fitPreview);
}

function setDrawer(panel: HTMLElement, toggle: HTMLButtonElement, open: boolean): void {
  if (open) panel.setAttribute('data-open', '');
  else panel.removeAttribute('data-open');
  toggle.setAttribute('aria-expanded', String(open));
  scrim.hidden = !library.hasAttribute('data-open') && !settingsPanel.hasAttribute('data-open');
}

function closeDrawers(): void {
  setDrawer(library, libraryToggle, false);
  setDrawer(settingsPanel, settingsToggle, false);
}

function transposeBy(step: number): void {
  let value = state.song.settings.transpose + step;
  if (value > 11) value -= 12;
  if (value < -11) value += 12;
  changeSettings({ transpose: value });
}

const roundSize = (value: number) =>
  Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, Math.round(value * 2) / 2));

/** True when no lyric line had to wrap to fit its column. */
function nothingWraps(): boolean {
  const pairsFlat = [...sheet.querySelectorAll<HTMLElement>('.pair')].every((pair) => {
    const segments = pair.children as HTMLCollectionOf<HTMLElement>;
    return segments.length < 2 || segments[0]!.offsetTop === segments[segments.length - 1]!.offsetTop;
  });
  const lyricLineHeight = state.song.settings.lyricPx * 1.25;
  return pairsFlat && [...sheet.querySelectorAll<HTMLElement>('.row.lyric')].every((row) => row.offsetHeight < lyricLineHeight * 1.5);
}

/**
 * Largest text size (half-pixel steps, keeping the chord/lyric ratio) that fits
 * on one page, preferring sizes where no lyric line wraps.
 */
function fitToPage(): void {
  const original = { chordPx: state.song.settings.chordPx, lyricPx: state.song.settings.lyricPx };
  const ratio = original.chordPx / original.lyricPx;
  const sizesFor = (step: number) => {
    const lyricPx = SIZE_RANGE.min + step / 2;
    return { lyricPx, chordPx: roundSize(lyricPx * ratio) };
  };
  const fits = (step: number, allowWrapping: boolean) => {
    Object.assign(state.song.settings, sizesFor(step));
    // A little room to spare, so printing never spills onto a second page.
    return renderSheetView() === 1 && contentMm() <= PAGE_CONTENT_MM * 0.97 && (allowWrapping || nothingWraps());
  };
  // Fitting gets harder as the size grows, so binary search for the last size that fits.
  const largest = (allowWrapping: boolean): number | undefined => {
    const steps = (SIZE_RANGE.max - SIZE_RANGE.min) * 2;
    if (!fits(0, allowWrapping)) return undefined;
    if (fits(steps, allowWrapping)) return steps;
    let low = 0;
    let high = steps;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (fits(mid, allowWrapping)) low = mid;
      else high = mid;
    }
    return low;
  };

  const unwrapped = largest(false);
  const step = unwrapped ?? largest(true);
  if (step === undefined) {
    Object.assign(state.song.settings, original);
    refresh();
    setStatus('Too long for one page even at the smallest size. Try more columns or hiding sections.', 'error');
    return;
  }
  const best = sizesFor(step);
  changeSettings(best);
  const note = unwrapped === undefined ? ' Some long lines wrap; try fewer columns.' : '';
  setStatus(`Fitted to one page: lyrics ${best.lyricPx}px, chords ${best.chordPx}px.${note}`, 'ok');
}

// ---------- Events ----------

songList.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const folder = target.closest<HTMLButtonElement>('button[data-folder]');
  if (folder) return toggleFolder(folder.dataset.folder!);
  const printButton = target.closest<HTMLButtonElement>('button[data-print-folder]');
  if (printButton) return printFolder(printButton.dataset.printFolder!);
  if (target instanceof HTMLInputElement && target.dataset.selectFolder !== undefined) {
    return selectFolder(target.dataset.selectFolder, target.checked);
  }
  if (target instanceof HTMLInputElement && target.dataset.select) {
    return selectSong(target.dataset.select.slice(5), target.checked, event.shiftKey);
  }

  const button = target.closest<HTMLButtonElement>('button[data-key]');
  if (!button) return;
  const key = button.dataset.key!;
  if ((event.ctrlKey || event.metaKey) && key.startsWith('song:')) {
    state.selected ??= new Set();
    return selectSong(key.slice(5), true, false);
  }
  if (!confirmDiscard()) return;
  await openKey(key);
  setDrawer(library, libraryToggle, false);
});

search.addEventListener('input', renderLibrary);
search.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') songList.querySelector<HTMLButtonElement>('button[data-key]')?.click();
});

input.addEventListener('input', () => {
  state.song.text = input.value;
  markDirty();
  scheduleRefresh();
});

titleInput.addEventListener('input', () => {
  state.song.title = titleInput.value;
  markDirty();
  scheduleRefresh();
});

$('transpose-down').addEventListener('click', () => transposeBy(-1));
$('transpose-up').addEventListener('click', () => transposeBy(1));
$('transpose-reset').addEventListener('click', () => changeSettings({ transpose: 0 }));
capo.addEventListener('change', () => changeSettings({ capo: Number(capo.value) }));
chordSize.addEventListener('input', () => changeSettings({ chordPx: Number(chordSize.value) }));
lyricSize.addEventListener('input', () => changeSettings({ lyricPx: Number(lyricSize.value) }));
showTabs.addEventListener('change', () => changeSettings({ showTabs: showTabs.checked }));
keySelect.addEventListener('change', () => changeSettings({ key: keySelect.value }));
nashville.addEventListener('change', () => changeSettings({ nashville: nashville.checked }));
$('fit').addEventListener('click', fitToPage);
sectionGap.addEventListener('input', () => changeSettings({ sectionGap: Number(sectionGap.value) }));
chordColor.addEventListener('input', () => changeSettings({ chordColor: chordColor.value }));
$('chord-color-reset').addEventListener('click', () => changeSettings({ chordColor: 'auto' }));
headerText.addEventListener('input', () => changeSettings({ headerText: headerText.value }));
footerText.addEventListener('input', () => changeSettings({ footerText: footerText.value }));

// ---------- Theme (an app preference, not saved with songs) ----------

type Theme = 'auto' | 'light' | 'dark';

function applyTheme(theme: Theme): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="theme"]')) radio.checked = radio.value === theme;
}

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="theme"]')) {
  radio.addEventListener('change', () => {
    applyTheme(radio.value as Theme);
    try {
      localStorage.setItem(THEME_KEY, radio.value);
    } catch {
      // The choice still applies for this visit.
    }
  });
}
applyTheme(storedTheme());

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="accidentals"]')) {
  radio.addEventListener('change', () => changeSettings({ accidentals: radio.value as SheetSettings['accidentals'] }));
}
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="columns"]')) {
  radio.addEventListener('change', () => changeSettings({ columns: Number(radio.value) as SheetSettings['columns'] }));
}

sections.addEventListener('change', (event) => {
  const box = event.target as HTMLInputElement;
  const id = box.dataset.block;
  if (!id) return;
  const role = box.dataset.role;
  const field = role === 'visible' ? 'hiddenBlocks' : role === 'header' ? 'headerOnlyBlocks' : 'chordlessBlocks';
  const ids = new Set(state.song.settings[field]);
  // "Show" and "Chords" are checked when the id is not in their list; "Header only" when it is.
  if (box.checked === (role === 'header')) ids.add(id);
  else ids.delete(id);
  changeSettings({ [field]: [...ids].sort() });
});

urlForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (confirmDiscard()) void openLink(urlInput.value.trim());
});

$('new-song').addEventListener('click', newSong);
selectButton.addEventListener('click', () => setSelecting(!state.selected));
$('done-selecting').addEventListener('click', () => setSelecting(false));
moveSelected.addEventListener('click', openFolderDialog);
pasteSelected.addEventListener('click', () => openPasteDialog('selected'));
$('copy-settings').addEventListener('click', copySettings);
pasteButton.addEventListener('click', () => openPasteDialog('open'));
$('paste-form').addEventListener('submit', (event) => {
  event.preventDefault();
  pasteChosen();
});
$('folder-form').addEventListener('submit', (event) => {
  event.preventDefault();
  moveSelectedSongs();
});
$('paste-cancel').addEventListener('click', () => closeDialog(pasteDialog));
$('folder-cancel').addEventListener('click', () => closeDialog(folderDialog));
saveButton.addEventListener('click', save);
deleteButton.addEventListener('click', deleteCurrent);
$('print').addEventListener('click', printSheet);
editToggle.addEventListener('click', () => setEditor(editor.hidden));
libraryToggle.addEventListener('click', () => setDrawer(library, libraryToggle, !library.hasAttribute('data-open')));
settingsToggle.addEventListener('click', () =>
  setDrawer(settingsPanel, settingsToggle, !settingsPanel.hasAttribute('data-open')),
);
scrim.addEventListener('click', closeDrawers);

$('export-library').addEventListener('click', () => {
  if (state.library.length === 0) {
    setStatus('Your library is empty; save a song first.', 'error');
    return;
  }
  exportLibrary();
  setStatus(`Exported ${state.library.length} song${state.library.length === 1 ? '' : 's'}.`, 'ok');
});

$<HTMLInputElement>('import-library').addEventListener('change', async (event) => {
  const fileInput = event.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const result = await importLibrary(file);
    state.library = result.songs;
    refresh();
    const skipped = result.skipped ? `, ${result.skipped} skipped` : '';
    setStatus(`Imported library: ${result.added} new, ${result.updated} updated${skipped}.`, 'ok');
  } catch (error) {
    setStatus((error as Error).message, 'error');
  }
});

const bookmarklet = $<HTMLAnchorElement>('bookmarklet');
bookmarklet.href = bookmarkletHref(location.origin + location.pathname);
bookmarklet.addEventListener('click', (event) => {
  event.preventDefault();
  setStatus('Drag this link to your bookmarks bar, then click it on a chord page of the tab site.');
});

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 's') {
    event.preventDefault();
    save();
  } else if (mod && key === 'e') {
    event.preventDefault();
    setEditor(editor.hidden);
    if (!editor.hidden) input.focus();
  } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    transposeBy(event.key === 'ArrowUp' ? 1 : -1);
  } else if (event.key === '/' && !isTyping(event.target)) {
    event.preventDefault();
    setDrawer(library, libraryToggle, getComputedStyle(libraryToggle).display !== 'none');
    search.focus();
  } else if (event.key === 'Escape') {
    // An open dialog closes on its own.
    if (pasteDialog.hasAttribute('open') || folderDialog.hasAttribute('open')) return;
    if (state.selected) setSelecting(false);
    else closeDrawers();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (state.dirty) event.preventDefault();
});

new ResizeObserver(fitPreview).observe(preview);

// ---------- Start ----------

keySelect.replaceChildren(
  new Option('Auto-detect', 'auto'),
  ...['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].flatMap((note) => [
    new Option(note, note),
    new Option(`${note}m`, `${note}m`),
  ]),
);
capo.replaceChildren(
  ...Array.from({ length: 12 }, (_, fret) => new Option(fret === 0 ? 'No capo' : `Fret ${fret}`, String(fret))),
);

const BAD_PAYLOAD = 'The bookmarklet did not send a chord sheet.';

/** Opens a song sent by the bookmarklet (#import=…); false when there is none or it was unusable. */
function openImportPayload(): boolean {
  const payload = takeImportPayload();
  if (payload === undefined) return false;
  const shared = sheetFromShared(payload);
  if (!shared) {
    setStatus(BAD_PAYLOAD, 'error');
    return false;
  }
  if (!confirmDiscard()) return true;
  openSong(songFromShared(shared));
  setStatus(`Imported “${shared.title ?? 'song'}” from the tab site. Save it to keep it.`, 'ok');
  return true;
}

// The bookmarklet opens a new tab, but a tab that is already open may get the hash too.
window.addEventListener('hashchange', openImportPayload);

async function start(): Promise<void> {
  state.lists = await loadListedSongs();
  urlForm.hidden = state.lists === undefined;
  const sentSomething = location.hash.startsWith(IMPORT_HASH);
  if (openImportPayload()) return;
  // Opening a default song below must not hide that the sent song was unusable.
  const unusable = sentSomething;

  const params = new URLSearchParams(location.search);
  const songParam = params.get('song');
  const urlParam = params.get('url');
  let lastOpened: string | null = null;
  try {
    lastOpened = localStorage.getItem(LAST_OPENED_KEY);
  } catch {
    // Storage may be unavailable (private mode); start from the defaults below.
  }

  const candidates = [
    songParam ? `song:${songParam}` : undefined,
    urlParam ? `link:${urlParam}` : undefined,
    lastOpened ?? undefined,
    state.library[0] ? `song:${state.library[0].id}` : undefined,
    state.lists?.[0] ? `link:${state.lists[0].url}` : undefined,
  ];
  for (const key of candidates) {
    if (key && (await openKey(key))) return reportUnusable();
  }
  openExample();
  reportUnusable();

  function reportUnusable(): void {
    if (unusable) setStatus(BAD_PAYLOAD, 'error');
  }
}

void start();

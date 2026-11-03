// Side-panel rendering: the song library list and the sections list.

import type { Block } from '../core';
import { el } from './render';

export interface SongEntry {
  /** Unique key for the entry, used as data-key on its button. */
  key: string;
  label: string;
  detail?: string;
  badge?: string;
}

export interface SongFolder {
  name: string;
  entries: SongEntry[];
}

export interface SongGroup {
  name: string;
  entries: SongEntry[];
  /** Folders in the group, listed above its loose entries. */
  folders?: SongFolder[];
  /** Whether a search also matches the group's name (a saved list); false for built-in groups. */
  matchName?: boolean;
}

export interface SongListView {
  /** Keys of the selected entries; set while selecting songs, undefined otherwise. */
  selected?: ReadonlySet<string>;
  /** Names of folders shown closed (a search opens them all). */
  collapsed?: ReadonlySet<string>;
}

function songRow(entry: SongEntry, activeKey: string | undefined, selected: ReadonlySet<string> | undefined): HTMLElement {
  const item = el('li', '');
  // While selecting, the whole row is a checkbox label; otherwise it opens the song.
  const row = selected ? el('label', 'song-item selectable') : el('button', 'song-item');
  if (row instanceof HTMLButtonElement) {
    row.type = 'button';
    row.dataset.key = entry.key;
  } else {
    const box = el('input', 'select-box');
    box.type = 'checkbox';
    box.checked = selected!.has(entry.key);
    box.dataset.select = entry.key;
    box.dataset.focusKey = `select:${entry.key}`;
    row.append(box);
  }
  if (entry.key === activeKey) row.setAttribute('aria-current', 'true');
  const text = el('span', 'song-text');
  text.append(el('span', 'song-label', entry.label));
  if (entry.detail || entry.badge) {
    const meta = el('span', 'song-meta');
    if (entry.detail) meta.append(el('span', '', entry.detail));
    if (entry.badge) meta.append(el('span', 'badge', entry.badge));
    text.append(meta);
  }
  row.append(text);
  item.append(row);
  return item;
}

const PRINT_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></svg>';

function folderRow(folder: SongFolder, entries: SongEntry[], open: boolean, rows: HTMLElement[], selected: ReadonlySet<string> | undefined): HTMLElement {
  const item = el('li', 'folder');
  const head = el('div', 'folder-head');
  if (selected) {
    const box = el('input', 'select-box');
    box.type = 'checkbox';
    const count = folder.entries.filter((entry) => selected.has(entry.key)).length;
    box.checked = count > 0 && count === folder.entries.length;
    box.indeterminate = count > 0 && count < folder.entries.length;
    box.dataset.selectFolder = folder.name;
    box.dataset.focusKey = `select-folder:${folder.name}`;
    box.setAttribute('aria-label', `Select all songs in ${folder.name}`);
    head.append(box);
  }
  const toggle = el('button', 'folder-toggle');
  toggle.type = 'button';
  toggle.dataset.folder = folder.name;
  toggle.dataset.focusKey = `folder:${folder.name}`;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.append(el('span', 'folder-name', folder.name), el('span', 'folder-count', String(entries.length)));
  head.append(toggle);
  if (!selected) {
    const print = el('button', 'folder-print');
    print.type = 'button';
    print.dataset.printFolder = folder.name;
    print.dataset.focusKey = `print-folder:${folder.name}`;
    print.title = `Print all songs in ${folder.name}`;
    print.setAttribute('aria-label', `Print all songs in ${folder.name}`);
    print.innerHTML = PRINT_ICON;
    head.append(print);
  }
  item.append(head);
  if (open) {
    const list = el('ul', 'song-items');
    list.append(...rows);
    item.append(list);
  }
  return item;
}

export function renderSongList(
  root: HTMLElement,
  groups: SongGroup[],
  activeKey: string | undefined,
  query: string,
  view: SongListView = {},
): void {
  const needle = query.trim().toLowerCase();
  const matches = (entry: SongEntry, ...names: (string | false)[]) =>
    !needle || [entry.label, entry.detail ?? '', ...names].join(' ').toLowerCase().includes(needle);
  const { selected, collapsed } = view;

  const nodes: HTMLElement[] = [];
  for (const group of groups) {
    const groupName = group.matchName !== false && group.name;
    const list = el('ul', 'song-items');
    for (const folder of group.folders ?? []) {
      const entries = folder.entries.filter((entry) => matches(entry, groupName, folder.name));
      if (entries.length === 0) continue;
      const open = Boolean(needle) || !collapsed?.has(folder.name);
      const rows = open ? entries.map((entry) => songRow(entry, activeKey, selected)) : [];
      list.append(folderRow(folder, entries, open, rows, selected));
    }
    for (const entry of group.entries) {
      if (matches(entry, groupName)) list.append(songRow(entry, activeKey, selected));
    }
    if (list.childElementCount === 0) continue;
    const section = el('section', 'song-group');
    section.append(el('h3', 'song-group-title', group.name), list);
    nodes.push(section);
  }
  if (nodes.length === 0) nodes.push(el('p', 'empty-note', needle ? 'No songs match your search.' : 'No songs yet.'));
  root.replaceChildren(...nodes);
}

/** Readable name for a block: its header, else the start of its first lyric. */
export function blockLabel(block: Block, index: number): string {
  if (block.title) return block.title;
  const lyric = block.lines.find((line) => line.kind === 'Lyric')?.raw.trim();
  if (lyric) return `“${lyric.length > 28 ? `${lyric.slice(0, 26)}…` : lyric}”`;
  return `Section ${index + 1}`;
}

export function renderSections(
  root: HTMLElement,
  blocks: Block[],
  hidden: ReadonlySet<string>,
  chordless: ReadonlySet<string>,
  headerOnly: ReadonlySet<string> = new Set(),
): void {
  if (blocks.length === 0) {
    root.replaceChildren(el('p', 'empty-note', 'Sections appear here once the sheet has content.'));
    return;
  }
  const rows = blocks.map((block, index) => {
    const row = el('li', hidden.has(block.id) ? 'section-row is-hidden' : 'section-row');
    const label = el('span', 'section-label', blockLabel(block, index));
    const toggle = (role: 'visible' | 'chords' | 'header', text: string, checked: boolean, disabled = false) => {
      const wrap = el('label', 'mini-check');
      const box = el('input', '');
      box.type = 'checkbox';
      box.checked = checked;
      box.disabled = disabled;
      box.dataset.block = block.id;
      box.dataset.role = role;
      box.dataset.focusKey = `${role}:${block.id}`;
      wrap.append(box, el('span', '', text));
      return wrap;
    };
    const hasChords = block.lines.some((line) => line.kind === 'Chord');
    const isHeaderOnly = block.title !== undefined && headerOnly.has(block.id);
    const chords = toggle('chords', 'Chords', hasChords && !chordless.has(block.id), !hasChords || hidden.has(block.id) || isHeaderOnly);
    const header = toggle('header', 'Header only', isHeaderOnly, block.title === undefined || hidden.has(block.id));
    header.title = block.title === undefined ? 'Only sections with a header can be shortened to it' : `Print just “${block.title}”`;
    row.append(label, toggle('visible', 'Show', !hidden.has(block.id)), chords, header);
    return row;
  });
  const list = el('ul', 'section-list');
  list.append(...rows);
  root.replaceChildren(list);
}

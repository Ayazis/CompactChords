/** @jest-environment jsdom */
import {
  cleanFolderName,
  DEFAULT_SHEET_SETTINGS,
  parseStoredSong,
  pasteSettings,
  SETTING_GROUPS,
  type SheetSettings,
  type StoredSong,
} from '../../src/core/songs';
import { renderSongList } from '../../src/ui/panels';
import { bootApp, disposeApp, type App } from './harness';

const LIBRARY_KEY = 'compact-chords.library.v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const song = (id: string, folder?: string, patch: Partial<SheetSettings> = {}): StoredSong => ({
  id,
  title: id,
  details: '',
  text: '[Verse]\nG  D\nHello world\n\n[Chorus]\nC  G\nMore words',
  settings: { ...clone(DEFAULT_SHEET_SETTINGS), ...patch },
  savedAt: '2026-01-01T00:00:00.000Z',
  ...(folder ? { folder } : {}),
});
const library = (...songs: StoredSong[]) => ({ [LIBRARY_KEY]: JSON.stringify(songs) });
const storedById = (app: App) => new Map((app.stored() as StoredSong[]).map((each) => [each.id, each]));

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterEach(() => {
  disposeApp();
  jest.useRealTimers();
});

describe('pasting settings (core)', () => {
  const source = { ...clone(DEFAULT_SHEET_SETTINGS), chordPx: 9, lyricPx: 10, columns: 3 as const, transpose: 2, headerText: 'Band', hiddenBlocks: ['B1'] };
  const target = { ...clone(DEFAULT_SHEET_SETTINGS), capo: 4, footerText: 'mine' };

  it('takes only the chosen groups', () => {
    const result = pasteSettings(target, source, ['sizes', 'layout']);
    expect(result).toMatchObject({ chordPx: 9, lyricPx: 10, columns: 3, transpose: 0, capo: 4, headerText: '', footerText: 'mine', hiddenBlocks: [] });
  });

  it('takes key and sections when asked, without sharing arrays', () => {
    const result = pasteSettings(target, source, ['key', 'sections', 'banners']);
    expect(result).toMatchObject({ transpose: 2, capo: 0, headerText: 'Band', footerText: '', hiddenBlocks: ['B1'] });
    expect(result.hiddenBlocks).not.toBe(source.hiddenBlocks);
    expect(target.capo).toBe(4);
  });

  it('covers every setting with exactly one group', () => {
    const names = Object.values(SETTING_GROUPS).flat().sort();
    expect(names).toEqual(Object.keys(DEFAULT_SHEET_SETTINGS).sort());
  });
});

describe('folder names', () => {
  it('trims and collapses whitespace and control characters, and limits the length', () => {
    expect(cleanFolderName('  Gig \n\t set ')).toBe('Gig set');
    expect(cleanFolderName('   ')).toBe('');
    expect(cleanFolderName('x'.repeat(100))).toHaveLength(60);
  });

  it('keeps a stored folder and drops a bad one without losing the song', () => {
    expect(parseStoredSong({ ...song('my__a'), folder: ' Gig ' })?.folder).toBe('Gig');
    expect(parseStoredSong({ ...song('my__a'), folder: 5 })).not.toHaveProperty('folder');
    expect(parseStoredSong({ ...song('my__a'), folder: '' })).not.toHaveProperty('folder');
  });
});

describe('song list with folders', () => {
  const groups = [
    {
      name: 'My library',
      matchName: false,
      folders: [{ name: 'Gig', entries: [{ key: 'song:a', label: 'Alpha' }, { key: 'song:b', label: 'Beta' }] }],
      entries: [{ key: 'song:c', label: 'Charlie' }],
    },
  ];

  it('lists folders above loose songs, with a count', () => {
    const root = document.createElement('div');
    renderSongList(root, groups, undefined, '');
    expect([...root.querySelectorAll('.folder-name, .song-label')].map((node) => node.textContent)).toEqual(['Gig', 'Alpha', 'Beta', 'Charlie']);
    expect(root.querySelector('.folder-count')?.textContent).toBe('2');
  });

  it('hides the songs of a collapsed folder, unless searching', () => {
    const root = document.createElement('div');
    renderSongList(root, groups, undefined, '', { collapsed: new Set(['Gig']) });
    expect(root.querySelector('[data-folder="Gig"]')?.getAttribute('aria-expanded')).toBe('false');
    expect([...root.querySelectorAll('.song-label')].map((node) => node.textContent)).toEqual(['Charlie']);
    renderSongList(root, groups, undefined, 'beta', { collapsed: new Set(['Gig']) });
    expect([...root.querySelectorAll('.song-label')].map((node) => node.textContent)).toEqual(['Beta']);
  });

  it('matches the folder name in a search', () => {
    const root = document.createElement('div');
    renderSongList(root, groups, undefined, 'gig');
    expect([...root.querySelectorAll('.song-label')].map((node) => node.textContent)).toEqual(['Alpha', 'Beta']);
  });

  it('shows checkboxes while selecting, with a partly checked folder', () => {
    const root = document.createElement('div');
    renderSongList(root, groups, undefined, '', { selected: new Set(['song:a']) });
    expect(root.querySelectorAll('button[data-key]')).toHaveLength(0);
    const folderBox = root.querySelector<HTMLInputElement>('[data-select-folder="Gig"]')!;
    expect(folderBox.indeterminate).toBe(true);
    expect([...root.querySelectorAll<HTMLInputElement>('input[data-select]')].map((box) => box.checked)).toEqual([true, false, false]);
  });
});

describe('selecting songs in the library', () => {
  it('toggles selection mode and hides the other groups meanwhile', async () => {
    const app = await bootApp({ storage: library(song('my__a'), song('my__b')) });
    expect(app.$('#selection-bar').hidden).toBe(true);
    await app.click('#select-songs');
    expect(app.$('#select-songs').getAttribute('aria-pressed')).toBe('true');
    expect(app.$('#selection-bar').hidden).toBe(false);
    expect(app.$$('.song-group-title').map((node) => node.textContent)).toEqual(['My library']);
    expect(app.$<HTMLButtonElement>('#move-selected').disabled).toBe(true);
    await app.click('#done-selecting');
    expect(app.$('#selection-bar').hidden).toBe(true);
    expect(app.$$('.song-group-title').map((node) => node.textContent)).toEqual(['My library', 'Built-in']);
  });

  it('picks songs instead of opening them, and Shift+click selects a range', async () => {
    const app = await bootApp({ storage: library(song('my__a'), song('my__b'), song('my__c'), song('my__d')) });
    await app.click('#select-songs');
    await app.click('[data-select="song:my__a"]');
    app.$('[data-select="song:my__c"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await app.settle();
    expect(app.$('#selection-count').textContent).toBe('3 selected');
    expect(app.$$<HTMLInputElement>('input[data-select]').map((box) => box.checked)).toEqual([true, true, true, false]);
    expect(app.$<HTMLInputElement>('#title').value).toBe('my__a');
  });

  it('starts selecting with Ctrl+click on a song', async () => {
    const app = await bootApp({ storage: library(song('my__a'), song('my__b')) });
    app.$('[data-key="song:my__b"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await app.settle();
    expect(app.$('#selection-bar').hidden).toBe(false);
    expect(app.$<HTMLInputElement>('[data-select="song:my__b"]').checked).toBe(true);
    expect(app.$<HTMLInputElement>('#title').value).toBe('my__a');
  });

  it('selects all songs of a folder with its checkbox, and leaves with Escape', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Gig'), song('my__b', 'Gig'), song('my__c')) });
    await app.click('#select-songs');
    await app.click('[data-select-folder="Gig"]');
    expect(app.$('#selection-count').textContent).toBe('2 selected');
    expect(app.$<HTMLInputElement>('[data-select-folder="Gig"]').checked).toBe(true);
    await app.press('Escape');
    expect(app.$('#selection-bar').hidden).toBe(true);
  });
});

describe('folders', () => {
  it('prints all songs of a folder, each on its own sheet with its own settings', async () => {
    const app = await bootApp({ storage: library(song('my__b', 'Gig', { columns: 3 }), song('my__a', 'Gig'), song('my__c')) });
    await app.click('[data-print-folder="Gig"]');
    expect(app.print).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('batch-printing')).toBe(true);
    const sheets = app.$$('#batch-print .sheet');
    expect(sheets.map((node) => node.querySelector('.sheet-title')?.textContent)).toEqual(['my__a', 'my__b']);
    expect(sheets[1]!.style.getPropertyValue('--columns')).toBe('3');
    expect(app.status()).toBe('Printing 2 songs from “Gig”.');

    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('batch-printing')).toBe(false);
    expect(app.$$('#batch-print .sheet')).toHaveLength(0);
  });

  it('hides the folder print button while selecting', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Gig')) });
    await app.click('#select-songs');
    expect(app.$$('[data-print-folder]')).toHaveLength(0);
  });

  it('groups songs in folders that can be collapsed, remembered across visits', async () => {
    const storage = library(song('my__a', 'Gig'), song('my__b'));
    const app = await bootApp({ storage });
    expect(app.$$('.folder-name').map((node) => node.textContent)).toEqual(['Gig']);
    await app.click('[data-folder="Gig"]');
    expect(app.$$('.song-label').map((node) => node.textContent)).not.toContain('my__a');
    const again = await bootApp({ storage: { ...storage, 'compact-chords.collapsed-folders': localStorage.getItem('compact-chords.collapsed-folders')! } });
    expect(again.$('[data-folder="Gig"]').getAttribute('aria-expanded')).toBe('false');
  });

  it('moves selected songs into a new folder, renames it, and takes them out again', async () => {
    const app = await bootApp({ storage: library(song('my__a'), song('my__b'), song('my__c')) });
    await app.click('#select-songs');
    await app.click('[data-select="song:my__a"]');
    await app.click('[data-select="song:my__b"]');
    await app.click('#move-selected');
    expect(app.$('#folder-dialog').hasAttribute('open')).toBe(true);
    await app.type('#folder-name', '  Gig   set ');
    await app.click('#folder-form [type="submit"]');
    expect(app.$('#folder-dialog').hasAttribute('open')).toBe(false);
    expect(app.status()).toBe('Moved 2 songs to “Gig set”.');
    expect([...storedById(app).values()].map((each) => each.folder)).toEqual(['Gig set', 'Gig set', undefined]);

    await app.click('#move-selected');
    expect(app.$<HTMLInputElement>('#folder-name').value).toBe('Gig set');
    expect(app.$$<HTMLOptionElement>('#folder-names option').map((option) => option.value)).toEqual(['Gig set']);
    await app.type('#folder-name', 'Encores');
    await app.click('#folder-form [type="submit"]');
    expect(app.$$('.folder-name').map((node) => node.textContent)).toEqual(['Encores']);

    await app.click('#move-selected');
    await app.type('#folder-name', '');
    await app.click('#folder-form [type="submit"]');
    expect(app.status()).toBe('Took 2 songs out of their folder.');
    expect(app.$$('.folder-name')).toHaveLength(0);
    expect(storedById(app).get('my__a')).not.toHaveProperty('folder');
  });

  it('keeps the folder of the open song when it is saved again', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Gig')) });
    await app.type('#input', 'C\nchanged');
    await app.click('#save');
    expect(storedById(app).get('my__a')).toMatchObject({ folder: 'Gig', text: 'C\nchanged' });
  });

  it('exports and re-imports folders with the library', async () => {
    const app = await bootApp();
    const json = JSON.stringify({ format: 'compact-chords-library', version: 1, songs: [song('my__a', 'Gig')] });
    const file = new File([json], 'lib.json');
    Object.defineProperty(file, 'text', { value: async () => json });
    const input = app.$<HTMLInputElement>('#import-library');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await app.settle();
    expect(app.$$('.folder-name').map((node) => node.textContent)).toEqual(['Gig']);
  });
});

describe('copying and pasting settings', () => {
  const setRange = async (app: App, selector: string, value: string) => {
    const field = app.$<HTMLInputElement>(selector);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settle();
  };

  it('has nothing to paste until settings are copied', async () => {
    const app = await bootApp({ storage: library(song('my__a')) });
    expect(app.$<HTMLButtonElement>('#paste-settings').disabled).toBe(true);
    await app.click('#copy-settings');
    expect(app.status()).toMatch(/^Copied the settings of “my__a”/);
    expect(app.$<HTMLButtonElement>('#paste-settings').disabled).toBe(false);
  });

  it('pastes the chosen groups into the open song, which then needs saving', async () => {
    const app = await bootApp({ storage: library(song('my__a', undefined, { chordPx: 9, transpose: 3, headerText: 'Band' }), song('my__b', undefined, { capo: 2 })) });
    await app.click('#copy-settings');
    await app.click('[data-key="song:my__b"]');
    await app.click('#paste-settings');
    expect(app.$('#paste-dialog').hasAttribute('open')).toBe(true);
    expect(app.$('#paste-summary').textContent).toBe('From “my__a” into “my__b”.');
    // Sizes, layout and header & footer are chosen by default; key and sections are not.
    expect(app.$$<HTMLInputElement>('input[name="paste-group"]').filter((box) => box.checked).map((box) => box.value)).toEqual(['sizes', 'layout', 'banners']);
    await app.click('#paste-form [type="submit"]');
    expect(app.$<HTMLInputElement>('#chord-size').value).toBe('9');
    expect(app.$<HTMLInputElement>('#header-text').value).toBe('Band');
    expect(app.$('#transpose-value').textContent).toBe('0');
    expect(app.$<HTMLSelectElement>('#capo').value).toBe('2');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
    expect(storedById(app).get('my__b')!.settings.chordPx).toBe(12);
  });

  it('pastes into all selected songs at once and remembers the chosen groups', async () => {
    const app = await bootApp({
      storage: library(song('my__a', undefined, { columns: 3, transpose: 5 }), song('my__b', 'Gig'), song('my__c', 'Gig'), song('my__d')),
    });
    await app.click('#copy-settings');
    await app.click('#select-songs');
    await app.click('[data-select-folder="Gig"]');
    await app.click('[data-select="song:my__a"]');
    await app.click('#paste-selected');
    expect(app.$('#paste-summary').textContent).toBe('From “my__a” into 3 songs.');
    app.$<HTMLInputElement>('input[name="paste-group"][value="key"]').checked = true;
    app.$<HTMLInputElement>('input[name="paste-group"][value="sizes"]').checked = false;
    await app.click('#paste-form [type="submit"]');
    expect(app.status()).toBe('Pasted layout, header & footer, key & capo into 3 songs.');
    const stored = storedById(app);
    expect(['my__b', 'my__c'].map((id) => stored.get(id)!.settings)).toEqual([
      expect.objectContaining({ columns: 3, transpose: 5 }),
      expect.objectContaining({ columns: 3, transpose: 5 }),
    ]);
    expect(stored.get('my__d')!.settings.columns).toBe(2);
    expect(stored.get('my__b')!.savedAt).not.toBe('2026-01-01T00:00:00.000Z');

    await app.click('#paste-selected');
    expect(app.$$<HTMLInputElement>('input[name="paste-group"]').filter((box) => box.checked).map((box) => box.value)).toEqual(['layout', 'banners', 'key']);
  });

  it('updates the open song when it is among the selected songs, without making it dirty', async () => {
    const app = await bootApp({ storage: library(song('my__a'), song('my__b', undefined, { lyricPx: 16 })) });
    await app.click('[data-key="song:my__b"]');
    await app.click('#copy-settings');
    await app.click('[data-key="song:my__a"]');
    await app.click('#select-songs');
    await app.click('[data-select="song:my__a"]');
    await app.click('#paste-selected');
    await app.click('#paste-form [type="submit"]');
    expect(app.$<HTMLInputElement>('#lyric-size').value).toBe('16');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(false);
  });

  it('keeps copied settings across visits', async () => {
    const app = await bootApp({ storage: library(song('my__a')) });
    await setRange(app, '#lyric-size', '14');
    await app.click('#copy-settings');
    const copied = localStorage.getItem('compact-chords.copied-settings')!;
    const again = await bootApp({ storage: { ...library(song('my__b')), 'compact-chords.copied-settings': copied } });
    expect(again.$<HTMLButtonElement>('#paste-settings').disabled).toBe(false);
    await again.click('#paste-settings');
    await again.click('#paste-form [type="submit"]');
    expect(again.$<HTMLInputElement>('#lyric-size').value).toBe('14');
  });

  it('ignores corrupt copied settings', async () => {
    const app = await bootApp({ storage: { ...library(song('my__a')), 'compact-chords.copied-settings': '{"from":"x","settings":{"columns":9}}' } });
    expect(app.$<HTMLButtonElement>('#paste-settings').disabled).toBe(true);
  });

  it('refuses to paste nothing', async () => {
    const app = await bootApp({ storage: library(song('my__a')) });
    await app.click('#copy-settings');
    await app.click('#paste-settings');
    for (const box of app.$$<HTMLInputElement>('input[name="paste-group"]')) box.checked = false;
    await app.click('#paste-form [type="submit"]');
    expect(app.status()).toBe('Choose which settings to paste.');
    expect(app.$('#paste-dialog').hasAttribute('open')).toBe(true);
  });
});

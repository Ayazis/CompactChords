/** @jest-environment jsdom */
import { TAB_ORIGIN } from '../../src/core/importers/tab-site';
import { DEFAULT_SHEET_SETTINGS, mergeSongs, parseLibraryFile, parseSettings, parseStoredSong, SONG_ID, songIdForTitle, songIdForUrl } from '../../src/core/songs';
import { exportLibrary, importLibrary, putSong, readLibrary, removeSong } from '../../src/platform/library';
import { blockLabel, renderSections, renderSongList } from '../../src/ui/panels';
import { parseSheet } from '../../src/core';

const stored = (id: string, extra = {}) => ({
  id,
  title: id,
  details: '',
  text: 'G',
  settings: JSON.parse(JSON.stringify(DEFAULT_SHEET_SETTINGS)),
  savedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('song ids', () => {
  it('keeps ids within the storage limit for very long links and titles', () => {
    const longUrl = `${TAB_ORIGIN}/tab/${'artist-'.repeat(40)}/${'song-'.repeat(60)}chords-1`;
    for (const id of [songIdForUrl(longUrl), songIdForTitle('x'.repeat(500))!, songIdForTitle('a '.repeat(200))!]) {
      expect(id).toMatch(SONG_ID);
      expect(id.endsWith('_')).toBe(false);
    }
  });

  it('gives titles without Latin letters a stable id, and symbols-only titles none', () => {
    expect(songIdForTitle('日本語の歌')).toMatch(SONG_ID);
    expect(songIdForTitle('日本語の歌')).toBe(songIdForTitle('日本語の歌'));
    expect(songIdForTitle('日本語の歌')).not.toBe(songIdForTitle('русская песня'));
    expect(songIdForTitle('')).toBeUndefined();
    expect(songIdForTitle('   ')).toBeUndefined();
    expect(songIdForTitle('🎸🎸')).toBeUndefined();
  });

  it('ignores query strings, fragments and trailing slashes in links', () => {
    const base = songIdForUrl(`${TAB_ORIGIN}/tab/a/b-chords-1`);
    expect(songIdForUrl(`${TAB_ORIGIN}/tab/a/b-chords-1?x=1#top`)).toBe(base);
    expect(songIdForUrl(`${TAB_ORIGIN}/tab/a/b-chords-1/`)).toBe(base);
  });

  it('accents do not change the id', () => {
    expect(songIdForTitle('Café del Mar')).toBe('my__cafe__del__mar');
  });

  it('throws for a link that is not a URL (callers must check)', () => {
    expect(() => songIdForUrl('nope')).toThrow();
  });
});

describe('parseSettings strictness', () => {
  it.each([
    ['chordPx', 5.9], ['chordPx', 24.1], ['chordPx', NaN], ['chordPx', '12'], ['lyricPx', Infinity],
    ['columns', 0], ['columns', 4], ['columns', 2.5], ['transpose', 12], ['transpose', -12], ['capo', -1], ['capo', 12],
    ['accidentals', 'sharps'], ['showTabs', 'yes'], ['hiddenBlocks', 'B1'], ['hiddenBlocks', ['x']], ['hiddenBlocks', ['B12345']],
    ['chordlessBlocks', [1]], ['hiddenBlocks', Array.from({ length: 501 }, (_, i) => `B${i}`)],
  ])('rejects %s = %p', (field, value) => {
    expect(parseSettings({ ...DEFAULT_SHEET_SETTINGS, [field]: value })).toBeUndefined();
  });

  it.each([null, 'x', 5, []])('rejects non-object %p', (value) => {
    // An array has no setting fields, so it parses to defaults like an empty object.
    expect(parseSettings(value) === undefined).toBe(!Array.isArray(value));
  });

  it('does not share arrays with its input or with the defaults', () => {
    const input = { hiddenBlocks: ['B1'] };
    const parsed = parseSettings(input)!;
    parsed.hiddenBlocks.push('B2');
    expect(input.hiddenBlocks).toEqual(['B1']);
    expect(DEFAULT_SHEET_SETTINGS.hiddenBlocks).toEqual([]);
    expect(parseSettings({})!.chordlessBlocks).not.toBe(DEFAULT_SHEET_SETTINGS.chordlessBlocks);
  });

  it('drops unknown fields', () => {
    expect(parseSettings({ evil: 1 })).toEqual(DEFAULT_SHEET_SETTINGS);
  });
});

describe('parseStoredSong strictness', () => {
  it.each([
    { id: '' }, { id: 'UPPER' }, { id: '-x' }, { id: 'a/b' }, { id: 'a'.repeat(152) }, { id: 5 }, { title: 5 }, { text: null }, { url: 5 }, { settings: 'x' },
  ])('rejects %p', (patch) => {
    expect(parseStoredSong({ ...stored('my__a'), ...patch })).toBeUndefined();
  });

  it('accepts an id of exactly the maximum length and fills in missing optional fields', () => {
    const id = 'a'.repeat(151);
    expect(parseStoredSong({ id, title: 't', text: 'x', settings: {} })).toMatchObject({ id, details: '', savedAt: '1970-01-01T00:00:00.000Z' });
  });

  it('drops an empty url instead of keeping it', () => {
    expect(parseStoredSong({ ...stored('my__a'), url: '' })).not.toHaveProperty('url');
  });
});

describe('library files', () => {
  it('reads a bare array of songs and skips the broken ones', () => {
    expect(parseLibraryFile([stored('my__a'), { id: 1 }])).toMatchObject({ songs: [{ id: 'my__a' }], skipped: 1 });
  });

  it.each([null, 'x', 5, {}, { format: 'other', songs: [] }, { format: 'compact-chords-library' }, { format: 'compact-chords-library', songs: 'x' }])(
    'rejects %p',
    (value) => expect(parseLibraryFile(value)).toBeUndefined(),
  );

  it('merging keeps the position of replaced songs and counts correctly', () => {
    const result = mergeSongs([stored('my__a'), stored('my__b')], [stored('my__b', { text: 'new' }), stored('my__c'), stored('my__c', { text: 'newer' })]);
    expect(result.songs.map((song) => song.id)).toEqual(['my__a', 'my__b', 'my__c']);
    expect(result.songs[1]!.text).toBe('new');
    expect(result.songs[2]!.text).toBe('newer');
    expect([result.added, result.updated]).toEqual([1, 2]);
  });
});

describe('browser library storage', () => {
  beforeEach(() => localStorage.clear());

  it('puts, replaces and removes songs', () => {
    putSong(stored('my__a') as never);
    putSong(stored('my__b') as never);
    expect(putSong(stored('my__a', { text: 'changed' }) as never).map((song) => [song.id, song.text])).toEqual([['my__a', 'changed'], ['my__b', 'G']]);
    expect(removeSong('my__a').map((song) => song.id)).toEqual(['my__b']);
    expect(removeSong('missing')).toHaveLength(1);
  });

  it('reads an empty library from empty, corrupt or wrong-shaped storage', () => {
    expect(readLibrary()).toEqual([]);
    for (const value of ['{', '{"a":1}', 'null', '"x"']) {
      localStorage.setItem('compact-chords.library.v1', value);
      expect(readLibrary()).toEqual([]);
    }
  });

  it('reports a full storage on write', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => putSong(stored('my__a') as never)).toThrow('browser storage is full');
    jest.restoreAllMocks();
  });

  it('imports a file and merges it', async () => {
    putSong(stored('my__a') as never);
    const file = { name: 'b.json', text: async () => JSON.stringify([stored('my__a', { text: 'x' }), stored('my__b'), 5]) } as unknown as File;
    const result = await importLibrary(file);
    expect([result.added, result.updated, result.skipped]).toEqual([1, 1, 1]);
    expect(readLibrary().map((song) => song.id)).toEqual(['my__a', 'my__b']);
  });

  it('refuses a file that is not a library without touching storage', async () => {
    putSong(stored('my__a') as never);
    await expect(importLibrary({ name: 'x.json', text: async () => '{"x":1}' } as unknown as File)).rejects.toThrow('x.json is not a CompactChords library file.');
    expect(readLibrary()).toHaveLength(1);
  });

  it('exports a dated JSON file and releases the object URL', () => {
    jest.useFakeTimers();
    let name = '';
    const revoke = jest.fn();
    (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:1';
    (URL as unknown as Record<string, unknown>).revokeObjectURL = revoke;
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    exportLibrary();
    expect(name).toMatch(/^compact-chords-library-\d{4}-\d{2}-\d{2}\.json$/);
    jest.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:1');
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
});

describe('side panels', () => {
  it('labels sections by header, first lyric (shortened) or position', () => {
    const doc = parseSheet('[Verse]\nG\nhello\n[Chorus]\nla\n\nG  D\nA very long lyric line that goes on and on\n\nG');
    expect(doc.blocks.map((block, i) => blockLabel(block, i))).toEqual(['Verse', 'Chorus']);
    const untitled = parseSheet('G  D\nA very long lyric line that goes on and on\n\nG');
    expect(untitled.blocks.map((block, i) => blockLabel(block, i))).toEqual(['“A very long lyric line tha…”', 'Section 2']);
  });

  it('renders sections with disabled chord toggles for lyric-only or hidden sections', () => {
    const doc = parseSheet('[Words]\njust words\n\n[Chords]\nG  D\nhi');
    const root = document.createElement('div');
    renderSections(root, doc.blocks, new Set(['B1']), new Set());
    const box = (block: string, role: string) => root.querySelector<HTMLInputElement>(`input[data-block="${block}"][data-role="${role}"]`)!;
    expect(box('B0', 'chords').disabled).toBe(true);
    expect(box('B0', 'chords').checked).toBe(false);
    expect(box('B1', 'visible').checked).toBe(false);
    expect(box('B1', 'chords').disabled).toBe(true);
    expect(root.querySelectorAll('.is-hidden')).toHaveLength(1);
  });

  it('shows a hint instead of an empty section list', () => {
    const root = document.createElement('div');
    renderSections(root, [], new Set(), new Set());
    expect(root.textContent).toMatch(/Sections appear here/);
  });

  it('renders groups, skips empty ones, marks the active entry and escapes text', () => {
    const root = document.createElement('div');
    renderSongList(root, [
      { name: 'Mine', entries: [{ key: 'a', label: '<b>Bold</b>', detail: '+2', badge: 'saved' }] },
      { name: 'Empty', entries: [] },
    ], 'a', '');
    expect(root.querySelectorAll('.song-group')).toHaveLength(1);
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('[aria-current="true"]')?.getAttribute('data-key')).toBe('a');
    expect(root.querySelector('.badge')?.textContent).toBe('saved');
  });

  it('says there are no songs when everything is empty', () => {
    const root = document.createElement('div');
    renderSongList(root, [{ name: 'Mine', entries: [] }], undefined, '');
    expect(root.textContent).toBe('No songs yet.');
  });

  it('matches the search against label, detail and (optionally) group name', () => {
    const root = document.createElement('div');
    const groups = [
      { name: 'Farm', entries: [{ key: 'a', label: 'Alpha', detail: 'capo 2' }] },
      { name: 'Library', matchName: false, entries: [{ key: 'b', label: 'Beta' }] },
    ];
    const keys = (query: string) => {
      renderSongList(root, groups, undefined, query);
      return [...root.querySelectorAll('button')].map((button) => button.dataset.key);
    };
    expect(keys('capo')).toEqual(['a']);
    expect(keys('farm')).toEqual(['a']);
    expect(keys('library')).toEqual([]);
    expect(keys('  ALPHA ')).toEqual(['a']);
    expect(keys('')).toEqual(['a', 'b']);
  });
});

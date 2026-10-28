import { TAB_ORIGIN } from '../../src/core/importers/tab-site';
import {
  DEFAULT_SHEET_SETTINGS,
  libraryFile,
  mergeSongs,
  parseLibraryFile,
  parseSettings,
  parseStoredSong,
  SONG_ID,
  songIdForTitle,
  songIdForUrl,
  type StoredSong,
} from '../../src/core/songs';

const settings = {
  chordPx: 13,
  lyricPx: 11.5,
  showTabs: false,
  columns: 3,
  transpose: -2,
  capo: 3,
  accidentals: 'flat',
  nashville: false,
  hiddenBlocks: ['B2'],
  chordlessBlocks: ['B0', 'B4'],
  chordColor: '#aa3366',
  sectionGap: 1.5,
  headerText: 'The Band',
  footerText: '{date}',
};

const valid = {
  id: 'my__paper-lanterns',
  title: 'Paper Lanterns',
  details: 'Capo 2',
  text: 'G\nWords',
  settings,
  savedAt: '2026-10-28T12:00:00.000Z',
};

describe('song ids', () => {
  it('derives an id from an tab-site link', () => {
    expect(songIdForUrl(`${TAB_ORIGIN}/tab/the-hollies/long-cool-woman-chords-848040`)).toBe(
      'the-hollies__long-cool-woman-chords-848040',
    );
  });

  it('derives an id from a title', () => {
    expect(songIdForTitle('Sigur Rós – Hoppípolla')).toBe('my__sigur__ros__hoppipolla');
    expect(songIdForTitle('  ?!  ')).toBeUndefined();
  });

  it('only produces ids that are safe storage keys', () => {
    for (const id of [songIdForTitle('../../etc/passwd')!, songIdForUrl(`${TAB_ORIGIN}/tab/a/..%2F..%2Fb`)]) {
      expect(id).toMatch(SONG_ID);
    }
    expect(SONG_ID.test('../x')).toBe(false);
  });
});

describe('parseSettings', () => {
  it('accepts every setting', () => {
    expect(parseSettings(settings)).toEqual(settings);
  });

  it('fills in settings that older saves do not have', () => {
    expect(parseSettings({ chordPx: 14, lyricPx: 10, showTabs: false })).toEqual({
      ...DEFAULT_SHEET_SETTINGS,
      chordPx: 14,
      lyricPx: 10,
      showTabs: false,
    });
  });

  it('does not share default arrays between results', () => {
    const a = parseSettings({})!;
    a.hiddenBlocks.push('B1');
    expect(parseSettings({})!.hiddenBlocks).toEqual([]);
    expect(DEFAULT_SHEET_SETTINGS.hiddenBlocks).toEqual([]);
  });

  it.each([
    ['a size out of range', { chordPx: 200 }],
    ['a fractional transpose', { transpose: 1.5 }],
    ['a transpose beyond an octave', { transpose: 12 }],
    ['a negative capo', { capo: -1 }],
    ['4 columns', { columns: 4 }],
    ['unknown accidentals', { accidentals: 'double-sharp' }],
    ['malformed block ids', { hiddenBlocks: ['../x'] }],
    ['a non-boolean tab setting', { showTabs: 'yes' }],
  ])('rejects %s', (_case, patch) => expect(parseSettings({ ...settings, ...patch })).toBeUndefined());
});

describe('parseStoredSong', () => {
  it('accepts a valid song and keeps only known fields', () => {
    expect(parseStoredSong({ ...valid, extra: 'ignored' })).toEqual(valid);
  });

  it('keeps the source link and fills in missing details', () => {
    const { details: _details, ...withoutDetails } = valid;
    expect(parseStoredSong({ ...withoutDetails, url: `${TAB_ORIGIN}/tab/a/b` })).toEqual({
      ...valid,
      details: '',
      url: `${TAB_ORIGIN}/tab/a/b`,
    });
  });

  it.each([
    ['not an object', 'song'],
    ['an unsafe id', { ...valid, id: '../evil' }],
    ['a missing title', { ...valid, title: undefined }],
    ['text that is not a string', { ...valid, text: 42 }],
    ['a non-string link', { ...valid, url: 7 }],
    ['missing settings', { ...valid, settings: undefined }],
    ['invalid settings', { ...valid, settings: { ...settings, columns: 9 } }],
  ])('rejects %s', (_case, value) => expect(parseStoredSong(value)).toBeUndefined());
});

describe('library files', () => {
  const song = (id: string, title = id): StoredSong => parseStoredSong({ ...valid, id, title })!;

  it('round-trips through an export', () => {
    const file = libraryFile([song('a'), song('b')], new Date('2026-10-28T00:00:00Z'));
    expect(file).toMatchObject({ format: 'compact-chords-library', version: 1, exportedAt: '2026-10-28T00:00:00.000Z' });
    expect(parseLibraryFile(JSON.parse(JSON.stringify(file)))).toEqual({ songs: [song('a'), song('b')], skipped: 0 });
  });

  it('accepts a bare array and counts invalid entries', () => {
    expect(parseLibraryFile([song('a'), { id: '../x' }, 'junk'])).toEqual({ songs: [song('a')], skipped: 2 });
  });

  it.each([['an unrelated object', { songs: [] }], ['a string', 'nope'], ['null', null]])('rejects %s', (_case, value) =>
    expect(parseLibraryFile(value)).toBeUndefined(),
  );

  it('merges by id, replacing songs that already exist', () => {
    const result = mergeSongs([song('a', 'Old A'), song('b')], [song('a', 'New A'), song('c')]);
    expect(result.songs.map((s) => [s.id, s.title])).toEqual([
      ['a', 'New A'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
    expect([result.added, result.updated]).toEqual([1, 1]);
  });
});

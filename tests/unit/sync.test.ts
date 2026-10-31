import { DEFAULT_SHEET_SETTINGS, type StoredSong } from '../../src/core/songs';
import {
  isTombstone,
  parseCloudRecord,
  parseTombstone,
  reconcile,
  sameContent,
  tombstone,
  type Tombstone,
} from '../../src/core/sync';

const song = (id: string, savedAt: string, text = 'G\nHello'): StoredSong => ({
  id,
  title: id,
  details: '',
  text,
  settings: structuredClone(DEFAULT_SHEET_SETTINGS),
  savedAt: `2026-01-0${savedAt}T00:00:00.000Z`,
});
const gone = (id: string, savedAt: string): Tombstone => ({ id, deleted: true, savedAt: `2026-01-0${savedAt}T00:00:00.000Z` });
const ids = (songs: { id: string }[]) => songs.map((item) => item.id);

describe('reconcile', () => {
  it('uploads everything to an empty cloud and changes nothing locally', () => {
    const local = [song('a', '1'), song('b', '2')];
    const result = reconcile(local, [], []);
    expect(result.library).toEqual(local);
    expect(ids(result.upload)).toEqual(['a', 'b']);
    expect([result.received, result.removed]).toEqual([0, 0]);
  });

  it('downloads everything into an empty browser', () => {
    const remote = [song('a', '1'), song('b', '2')];
    const result = reconcile([], [], remote);
    expect(ids(result.library)).toEqual(['a', 'b']);
    expect(result.upload).toEqual([]);
    expect(result.received).toBe(2);
  });

  it('keeps the newest version of a song on either side', () => {
    const result = reconcile([song('a', '3', 'mine'), song('b', '1', 'old')], [], [song('a', '2', 'theirs'), song('b', '2', 'new')]);
    expect(result.library.map((item) => item.text)).toEqual(['mine', 'new']);
    expect(result.upload.map((item) => (item as StoredSong).text)).toEqual(['mine']);
    expect(result.received).toBe(1);
  });

  it('prefers the cloud on a tie, so nothing is uploaded', () => {
    const result = reconcile([song('a', '1', 'mine')], [], [song('a', '1', 'theirs')]);
    expect(result.library[0]!.text).toBe('theirs');
    expect(result.upload).toEqual([]);
    expect(result.received).toBe(1);
  });

  it('does not count an identical song as received, whatever its key order', () => {
    const local = song('a', '1');
    const { savedAt, ...rest } = local;
    const result = reconcile([local], [], [{ savedAt, ...rest, url: undefined } as StoredSong]);
    expect(result.received).toBe(0);
  });

  it('removes a song deleted on another device after it was last saved here', () => {
    const result = reconcile([song('a', '1'), song('b', '1')], [], [song('a', '1'), gone('b', '2')]);
    expect(ids(result.library)).toEqual(['a']);
    expect(result.removed).toBe(1);
    expect(result.upload).toEqual([]);
  });

  it('keeps a song that was saved here after it was deleted elsewhere', () => {
    const result = reconcile([song('a', '3')], [], [gone('a', '2')]);
    expect(ids(result.library)).toEqual(['a']);
    expect(ids(result.upload)).toEqual(['a']);
    expect(result.removed).toBe(0);
  });

  it('sends deletions made here and does not bring the song back', () => {
    const result = reconcile([], [gone('a', '2')], [song('a', '1')]);
    expect(result.library).toEqual([]);
    expect(result.upload).toEqual([gone('a', '2')]);
    expect(result.removed).toBe(0);
  });

  it('lets a newer cloud version win over a deletion made here', () => {
    const result = reconcile([], [gone('a', '1')], [song('a', '2')]);
    expect(ids(result.library)).toEqual(['a']);
    expect(result.upload).toEqual([]);
    expect(result.received).toBe(1);
  });

  it('ignores a deletion record that is older than the song it names', () => {
    const result = reconcile([song('a', '2')], [gone('a', '1')], []);
    expect(ids(result.library)).toEqual(['a']);
    expect(ids(result.upload)).toEqual(['a']);
  });

  it('uses the newest of duplicate records on one side', () => {
    const result = reconcile([], [], [song('a', '1', 'old'), song('a', '3', 'new'), song('a', '2', 'mid')]);
    expect(result.library.map((item) => item.text)).toEqual(['new']);
  });

  it('treats a record with an unreadable time as the oldest', () => {
    const result = reconcile([{ ...song('a', '1', 'mine'), savedAt: 'whenever' }], [], [song('a', '1', 'theirs')]);
    expect(result.library[0]!.text).toBe('theirs');
  });

  it('keeps the browser order and adds new songs at the end', () => {
    const result = reconcile([song('c', '1'), song('a', '1')], [], [song('b', '1'), song('a', '1'), song('d', '1')]);
    expect(ids(result.library)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('cloud records', () => {
  it('makes and recognises tombstones', () => {
    const record = tombstone('my__a', new Date('2026-02-03T04:05:06.000Z'));
    expect(record).toEqual({ id: 'my__a', deleted: true, savedAt: '2026-02-03T04:05:06.000Z' });
    expect(isTombstone(record)).toBe(true);
    expect(isTombstone(song('a', '1'))).toBe(false);
  });

  it('parses tombstones and songs from untrusted data', () => {
    expect(parseCloudRecord({ id: 'my__a', deleted: true, savedAt: '2026-01-01T00:00:00Z', extra: 1 })).toEqual({
      id: 'my__a',
      deleted: true,
      savedAt: '2026-01-01T00:00:00Z',
    });
    expect(parseCloudRecord(song('my__b', '1'))).toEqual(song('my__b', '1'));
  });

  it('rejects bad records', () => {
    for (const value of [null, 5, 'x', { deleted: true }, { id: '../x', deleted: true, savedAt: '2026-01-01' }, { id: 'a', deleted: true, savedAt: 'soon' }, { id: 'a', deleted: true, savedAt: 5 }, { id: 'a', title: 'no text' }]) {
      expect(parseCloudRecord(value)).toBeUndefined();
    }
    expect(parseTombstone(null)).toBeUndefined();
    expect(parseTombstone({ id: 'a', deleted: 'yes', savedAt: '2026-01-01' })).toBeUndefined();
  });

  it('compares content regardless of key order and undefined fields', () => {
    expect(sameContent({ a: 1, b: [1, { c: 2, d: undefined }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameContent([1, 2], [2, 1])).toBe(false);
  });
});

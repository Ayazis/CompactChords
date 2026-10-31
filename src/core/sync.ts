// Merging the browser library with the cloud copy (ADR-0005). Pure: the
// platform layer reads and writes both sides and applies the result.

import { parseStoredSong, SONG_ID, type StoredSong } from './songs';

/** Marks a song as deleted, so other devices remove it instead of uploading it again. */
export interface Tombstone {
  id: string;
  deleted: true;
  /** When the song was deleted (ISO time), compared with `savedAt` of songs. */
  savedAt: string;
}

/** What the cloud stores per song id. */
export type CloudRecord = StoredSong | Tombstone;

export const isTombstone = (record: CloudRecord): record is Tombstone => 'deleted' in record && record.deleted === true;

export function tombstone(id: string, now = new Date()): Tombstone {
  return { id, deleted: true, savedAt: now.toISOString() };
}

/** Checks a tombstone from untrusted data (storage, the cloud). */
export function parseTombstone(value: unknown): Tombstone | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.deleted !== true || typeof record.id !== 'string' || !SONG_ID.test(record.id) || !isTime(record.savedAt)) {
    return undefined;
  }
  return { id: record.id, deleted: true, savedAt: record.savedAt };
}

/** Checks a record read from the cloud: a song or a tombstone. */
export function parseCloudRecord(value: unknown): CloudRecord | undefined {
  if (typeof value === 'object' && value !== null && (value as { deleted?: unknown }).deleted === true) {
    return parseTombstone(value);
  }
  return parseStoredSong(value);
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

const time = (record: CloudRecord) => Date.parse(record.savedAt) || 0;

/** Same content, ignoring key order (the cloud does not keep it) and undefined fields. */
export function sameContent(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface SyncResult {
  /** The browser library after merging. */
  library: StoredSong[];
  /** Records the cloud is missing or has an older version of. */
  upload: CloudRecord[];
  /** Songs added or changed in the browser library by the cloud copy. */
  received: number;
  /** Songs removed from the browser library because they were deleted elsewhere. */
  removed: number;
}

/**
 * Merges the browser library (songs plus local deletions) with the cloud
 * records. Per song id the newest record wins, by `savedAt`; a deletion is a
 * record too, so a song deleted on one device is removed on the others rather
 * than uploaded again. On a tie the cloud wins, so nothing is uploaded.
 */
export function reconcile(local: StoredSong[], localDeleted: Tombstone[], remote: CloudRecord[]): SyncResult {
  const mine = new Map<string, CloudRecord>();
  for (const record of [...localDeleted, ...local]) {
    const current = mine.get(record.id);
    if (!current || time(record) >= time(current)) mine.set(record.id, record);
  }
  const theirs = new Map<string, CloudRecord>();
  for (const record of remote) {
    const current = theirs.get(record.id);
    if (!current || time(record) >= time(current)) theirs.set(record.id, record);
  }

  const upload: CloudRecord[] = [];
  const winners = new Map<string, CloudRecord>();
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const ours = mine.get(id);
    const cloud = theirs.get(id);
    if (ours && (!cloud || time(ours) > time(cloud))) {
      winners.set(id, ours);
      upload.push(ours);
    } else {
      winners.set(id, cloud!);
    }
  }

  let received = 0;
  let removed = 0;
  const library: StoredSong[] = [];
  const localById = new Map(local.map((song) => [song.id, song]));
  for (const [id, winner] of winners) {
    const before = localById.get(id);
    if (isTombstone(winner)) {
      if (before) removed++;
      continue;
    }
    if (!before || !sameContent(before, winner)) received++;
    library.push(winner);
  }
  // Keep the browser's order for songs it already had; new ones go last.
  const order = new Map(local.map((song, index) => [song.id, index]));
  const rank = (song: StoredSong) => order.get(song.id) ?? local.length;
  library.sort((a, b) => rank(a) - rank(b));

  return { library, upload, received, removed };
}

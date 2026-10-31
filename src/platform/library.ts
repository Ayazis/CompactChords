// The song library lives in the browser (localStorage), so it works on any
// static host. Export/import to a JSON file backs it up or moves it; signing in
// also keeps it in the cloud (cloud.ts, ADR-0005).

import { libraryFile, mergeSongs, parseLibraryFile, parseStoredSong, type StoredSong } from '../core/songs';
import { parseTombstone, tombstone, type Tombstone } from '../core/sync';

const STORAGE_KEY = 'compact-chords.library.v1';
/** Songs deleted in this browser that the cloud may not know about yet. */
const DELETED_KEY = 'compact-chords.deleted.v1';

export function readLibrary(): StoredSong[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.map(parseStoredSong).filter((song): song is StoredSong => song !== undefined);
  } catch {
    return [];
  }
}

function writeLibrary(songs: StoredSong[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch {
    throw new Error('Could not save: browser storage is full or turned off.');
  }
  keepStorage();
}

// Asks the browser not to evict the library when space runs low. It does not
// override a "clear site data on close" setting.
function keepStorage(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}

export function readDeleted(): Tombstone[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.map(parseTombstone).filter((record): record is Tombstone => record !== undefined);
  } catch {
    return [];
  }
}

function writeDeleted(records: Tombstone[]): void {
  try {
    if (records.length) localStorage.setItem(DELETED_KEY, JSON.stringify(records));
    else localStorage.removeItem(DELETED_KEY);
  } catch {
    // Only matters for syncing; the cloud copy may then bring the song back.
  }
}

/** Forgets local deletions once the cloud has them (or a newer version). */
export function forgetDeleted(records: Tombstone[]): void {
  const done = new Set(records.map((record) => `${record.id} ${record.savedAt}`));
  writeDeleted(readDeleted().filter((record) => !done.has(`${record.id} ${record.savedAt}`)));
}

/** Empties the library and its deletion records, e.g. when signing out on a shared computer. */
export function clearLibrary(): void {
  writeLibrary([]);
  writeDeleted([]);
}

export function putSong(song: StoredSong): StoredSong[] {
  const songs = mergeSongs(readLibrary(), [song]).songs;
  writeLibrary(songs);
  writeDeleted(readDeleted().filter((record) => record.id !== song.id));
  return songs;
}

/** Removes a song and returns the library plus the deletion record for the cloud. */
export function removeSong(id: string, now = new Date()): { songs: StoredSong[]; deleted: Tombstone } {
  const songs = readLibrary().filter((song) => song.id !== id);
  writeLibrary(songs);
  const deleted = tombstone(id, now);
  writeDeleted([...readDeleted().filter((record) => record.id !== id), deleted]);
  return { songs, deleted };
}

/** Replaces the whole library, e.g. with the result of a cloud sync. */
export function replaceLibrary(songs: StoredSong[]): void {
  writeLibrary(songs);
}

export function exportLibrary(): void {
  const json = JSON.stringify(libraryFile(readLibrary()), null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = `compact-chords-library-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export async function importLibrary(file: File): Promise<{ added: number; updated: number; skipped: number; songs: StoredSong[] }> {
  let parsed: ReturnType<typeof parseLibraryFile>;
  try {
    parsed = parseLibraryFile(JSON.parse(await file.text()));
  } catch {
    parsed = undefined;
  }
  if (!parsed) throw new Error(`${file.name} is not a CompactChords library file.`);

  const merged = mergeSongs(readLibrary(), parsed.songs);
  writeLibrary(merged.songs);
  const imported = new Set(parsed.songs.map((song) => song.id));
  writeDeleted(readDeleted().filter((record) => !imported.has(record.id)));
  return { added: merged.added, updated: merged.updated, skipped: parsed.skipped, songs: merged.songs };
}

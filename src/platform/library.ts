// The song library lives in the browser (localStorage), so it works on any
// static host. Export/import to a JSON file is the way to back it up or move it.

import { libraryFile, mergeSongs, parseLibraryFile, parseStoredSong, type StoredSong } from '../core/songs';

const STORAGE_KEY = 'compact-chords.library.v1';

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

export function putSong(song: StoredSong): StoredSong[] {
  const songs = mergeSongs(readLibrary(), [song]).songs;
  writeLibrary(songs);
  return songs;
}

export function removeSong(id: string): StoredSong[] {
  const songs = readLibrary().filter((song) => song.id !== id);
  writeLibrary(songs);
  return songs;
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
  return { added: merged.added, updated: merged.updated, skipped: parsed.skipped, songs: merged.songs };
}

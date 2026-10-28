// A song in the user's library: its sheet text plus everything needed to print
// it the same way again (sizes, columns, transposition, hidden sections).

import type { Accidentals } from './transpose';

export interface SheetSettings {
  chordPx: number;
  lyricPx: number;
  showTabs: boolean;
  columns: 1 | 2 | 3;
  /** Semitones the song sounds higher (or lower, when negative). */
  transpose: number;
  /** Capo fret; chord shapes are shown relative to it. */
  capo: number;
  accidentals: Accidentals;
  /** Key to use instead of the detected one, e.g. "G" or "F#m". */
  key: 'auto' | string;
  /** Show chords as Nashville numbers instead of letter names. */
  nashville: boolean;
  /** Ids of blocks that are left out of the sheet. */
  hiddenBlocks: string[];
  /** Ids of blocks printed without chords. */
  chordlessBlocks: string[];
  /** "auto" follows the theme; otherwise a #rrggbb colour for chords. */
  chordColor: 'auto' | string;
  /** Space between sections, in em of the lyric size. */
  sectionGap: number;
  /** Fixed text above and below the sheet; "{date}" becomes today's date. */
  headerText: string;
  footerText: string;
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  chordPx: 12,
  lyricPx: 12,
  showTabs: true,
  columns: 2,
  transpose: 0,
  capo: 0,
  accidentals: 'auto',
  key: 'auto',
  nashville: false,
  hiddenBlocks: [],
  chordlessBlocks: [],
  chordColor: 'auto',
  sectionGap: 0.8,
  headerText: '',
  footerText: '',
};

export const SIZE_RANGE = { min: 6, max: 24 };
export const SECTION_GAP_RANGE = { min: 0, max: 3 };
export const BANNER_MAX = 200;

export interface StoredSong {
  id: string;
  /** Tab-site link the song came from, if any. */
  url?: string;
  title: string;
  details: string;
  text: string;
  settings: SheetSettings;
  savedAt: string;
}

/** Ids double as storage keys and file names, so they are restricted to safe characters. */
export const SONG_ID = /^[a-z0-9][a-z0-9_-]{0,150}$/;
const MAX_ID = 150;

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '__')
    .replace(/^_+|_+$/g, '');

/** "the-hollies__long-cool-woman-…-chords-848040" for a tab-site link. */
export function songIdForUrl(url: string): string {
  return slug(new URL(url).pathname.replace(/^\/tab\//, '')).slice(0, MAX_ID).replace(/_+$/, '');
}

/** Id for a pasted song, from its title: "my__artist__song". */
export function songIdForTitle(title: string): string | undefined {
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  const base = slug(trimmed.replace(/[–—]/g, ' '));
  if (base) return `my__${base}`.slice(0, MAX_ID).replace(/_+$/, '');
  // Titles without Latin letters or digits (e.g. Japanese) get a stable hash instead.
  return /[\p{L}\p{N}]/u.test(trimmed) ? `my__${hash(trimmed)}` : undefined;
}

/** Short stable hash (FNV-1a) as base 36. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 0x01000193) >>> 0;
  return value.toString(36);
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isSize = (value: unknown): value is number =>
  typeof value === 'number' && value >= SIZE_RANGE.min && value <= SIZE_RANGE.max;
const isBlockIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 500 && value.every((id) => typeof id === 'string' && /^B\d{1,4}$/.test(id));

const isBanner = (value: unknown): value is string => typeof value === 'string' && value.length <= BANNER_MAX;

const RULES: { [K in keyof SheetSettings]: (value: unknown) => boolean } = {
  chordPx: isSize,
  lyricPx: isSize,
  showTabs: (value) => typeof value === 'boolean',
  columns: (value) => isInt(value, 1, 3),
  transpose: (value) => isInt(value, -11, 11),
  capo: (value) => isInt(value, 0, 11),
  accidentals: (value) => value === 'auto' || value === 'sharp' || value === 'flat',
  key: (value) => value === 'auto' || (typeof value === 'string' && /^[A-G][#b]?m?$/.test(value)),
  nashville: (value) => typeof value === 'boolean',
  hiddenBlocks: isBlockIds,
  chordlessBlocks: isBlockIds,
  chordColor: (value) => value === 'auto' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)),
  sectionGap: (value) => typeof value === 'number' && value >= SECTION_GAP_RANGE.min && value <= SECTION_GAP_RANGE.max,
  headerText: isBanner,
  footerText: isBanner,
};

/**
 * Checks untrusted settings. Missing fields get their defaults (older saves
 * predate some settings); a field that is present but invalid rejects the lot.
 */
export function parseSettings(value: unknown): SheetSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = value as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  for (const [name, isValid] of Object.entries(RULES) as [keyof SheetSettings, (value: unknown) => boolean][]) {
    const field = input[name];
    if (field === undefined) settings[name] = structuredClone(DEFAULT_SHEET_SETTINGS[name]);
    else if (isValid(field)) settings[name] = Array.isArray(field) ? [...field] : field;
    else return undefined;
  }
  return settings as unknown as SheetSettings;
}

/** Checks untrusted JSON (storage, an imported file) and returns a clean StoredSong. */
export function parseStoredSong(value: unknown): StoredSong | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const song = value as Record<string, unknown>;
  const settings = parseSettings(song.settings);
  if (
    typeof song.id !== 'string' ||
    !SONG_ID.test(song.id) ||
    typeof song.title !== 'string' ||
    typeof song.text !== 'string' ||
    (song.url !== undefined && typeof song.url !== 'string') ||
    !settings
  ) {
    return undefined;
  }

  const stored: StoredSong = {
    id: song.id,
    title: song.title,
    details: typeof song.details === 'string' ? song.details : '',
    text: song.text,
    settings,
    savedAt: typeof song.savedAt === 'string' ? song.savedAt : new Date(0).toISOString(),
  };
  if (song.url) stored.url = song.url as string;
  return stored;
}

export const LIBRARY_FORMAT = 'compact-chords-library';

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  exportedAt: string;
  songs: StoredSong[];
}

export function libraryFile(songs: StoredSong[], now = new Date()): LibraryFile {
  return { format: LIBRARY_FORMAT, version: 1, exportedAt: now.toISOString(), songs };
}

/** Reads an exported library (or a bare array of songs), skipping invalid entries. */
export function parseLibraryFile(value: unknown): { songs: StoredSong[]; skipped: number } | undefined {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && (value as Partial<LibraryFile>).format === LIBRARY_FORMAT
      ? (value as { songs?: unknown }).songs
      : undefined;
  if (!Array.isArray(list)) return undefined;
  const songs = list.map(parseStoredSong).filter((song): song is StoredSong => song !== undefined);
  return { songs, skipped: list.length - songs.length };
}

/** Adds incoming songs to a library; a song with the same id is replaced. */
export function mergeSongs(
  existing: StoredSong[],
  incoming: StoredSong[],
): { songs: StoredSong[]; added: number; updated: number } {
  const byId = new Map(existing.map((song) => [song.id, song]));
  let added = 0;
  let updated = 0;
  for (const song of incoming) {
    if (byId.has(song.id)) updated++;
    else added++;
    byId.set(song.id, song);
  }
  return { songs: [...byId.values()], added, updated };
}

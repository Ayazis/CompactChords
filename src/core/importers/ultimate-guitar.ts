// Pulls the chord sheet out of an Ultimate Guitar tab page. The page embeds its
// data as HTML-escaped JSON in the data-content attribute of a ".js-store" div.

import { stripMarkup } from '../normalizer';

export interface ImportedSheet {
  title?: string;
  artist?: string;
  capo?: number;
  /** Only set when the tuning is not standard. */
  tuning?: string;
  text: string;
}

export class ImportError extends Error {}

const HOSTS = new Set(['tabs.ultimate-guitar.com', 'www.ultimate-guitar.com', 'ultimate-guitar.com']);
const STANDARD_TUNING = 'E A D G B E';

export function isUltimateGuitarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const fromSlug = (slug: string) => slug.split('-').filter(Boolean).map(capitalize).join(' ');

/** Readable "Artist – Song" from a link like /tab/the-hollies/long-cool-woman-chords-848040. */
export function labelFromUrl(url: string): string {
  const match = /\/tab\/([^/]+)\/([^/?#]+)/.exec(url);
  if (!match) return url;
  const song = match[2]!.replace(/-(?:chords|tabs?|ukulele|bass|guitar-pro|power)(?:-\d+)?$/, '').replace(/-\d+$/, '');
  return `${fromSlug(match[1]!)} – ${fromSlug(song)}`;
}

/** Ultimate Guitar links in a saved list, one per line; anything else is ignored. */
export function parseUrlList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isUltimateGuitarUrl);
}

const NAMED_ENTITIES: Record<string, string> = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

const STORE_ATTRIBUTE = /<div[^>]*\bclass="js-store"[^>]*\bdata-content="([^"]*)"|<div[^>]*\bdata-content="([^"]*)"[^>]*\bclass="js-store"/;

interface UgStore {
  store?: {
    page?: {
      data?: {
        tab?: { song_name?: string; artist_name?: string };
        tab_view?: {
          wiki_tab?: { content?: string };
          meta?: { capo?: number; tuning?: { value?: string } };
        };
      };
    };
  };
}

export function extractUltimateGuitar(html: string): ImportedSheet {
  const match = STORE_ATTRIBUTE.exec(html);
  const encoded = match?.[1] ?? match?.[2];
  if (encoded === undefined) throw new ImportError('No chord data found on this page.');

  let store: UgStore;
  try {
    store = JSON.parse(decodeEntities(encoded)) as UgStore;
  } catch {
    throw new ImportError('The chord data on this page could not be read.');
  }

  const data = store.store?.page?.data;
  const content = data?.tab_view?.wiki_tab?.content;
  if (typeof content !== 'string') {
    throw new ImportError('This page has no text chord sheet (Pro and Official tabs are not supported).');
  }

  const sheet = sheetFromShared({
    title: data?.tab?.song_name,
    artist: data?.tab?.artist_name,
    capo: data?.tab_view?.meta?.capo,
    tuning: data?.tab_view?.meta?.tuning?.value,
    text: content,
  });
  if (!sheet) throw new ImportError('This chord sheet is too large to import.');
  return sheet;
}

export interface SharedSheet extends ImportedSheet {
  url?: string;
}

const MAX_TEXT = 200_000;
const MAX_NAME = 200;

/**
 * Checks sheet fields from an untrusted source (the bookmarklet's #import=
 * payload, or a parsed page) and returns a clean sheet.
 */
export function sheetFromShared(value: unknown): SharedSheet | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.text !== 'string' || input.text.length > MAX_TEXT) return undefined;

  const name = (field: unknown) => (typeof field === 'string' && field.trim() ? field.trim().slice(0, MAX_NAME) : undefined);
  const sheet: SharedSheet = { text: stripMarkup(input.text).replace(/\r\n?/g, '\n') };
  const title = name(input.title);
  const artist = name(input.artist);
  const tuning = name(input.tuning);
  if (title) sheet.title = title;
  if (artist) sheet.artist = artist;
  if (Number.isInteger(input.capo) && (input.capo as number) > 0 && (input.capo as number) < 12) sheet.capo = input.capo as number;
  if (tuning && tuning !== STANDARD_TUNING) sheet.tuning = tuning;
  if (typeof input.url === 'string' && isUltimateGuitarUrl(input.url)) sheet.url = input.url;
  return sheet;
}

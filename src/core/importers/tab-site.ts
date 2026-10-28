// Pulls the chord sheet out of a tab-site page. The page embeds its
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
/** Origin of the supported site's tab pages. */
export const TAB_ORIGIN = 'https://tabs.ultimate-guitar.com';
const STANDARD_TUNING = 'E A D G B E';

export function isSupportedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const fromSlug = (slug: string) => slug.split('-').filter(Boolean).map(capitalize).join(' ');

const decodeSlug = (slug: string) => {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
};

/** Readable "Artist – Song" from a link like /tab/the-hollies/long-cool-woman-chords-848040. */
export function labelFromUrl(url: string): string {
  const match = /\/tab\/([^/]+)\/([^/?#]+)/.exec(url);
  if (!match) return url;
  const [artist, slug] = [match[1]!, match[2]!].map(decodeSlug) as [string, string];
  const song = slug.replace(/-(?:chords|tabs?|ukulele|bass|guitar-pro|power)(?:-\d+)?$/, '').replace(/-\d+$/, '');
  return `${fromSlug(artist)} – ${fromSlug(song)}`;
}

/** Tab-site links in a saved list, one per line; anything else is ignored. */
export function parseUrlList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isSupportedUrl);
}

const NAMED_ENTITIES: Record<string, string> = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      // Out-of-range references (&#99999999;) stay as written instead of throwing.
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

const DIV_TAG = /<div\b[^>]*>/gi;
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1, 3).find((value) => value !== undefined);

/** The data-content of the first ".js-store" element, still HTML-escaped. */
function storeContent(html: string): string | undefined {
  for (const [tag] of html.matchAll(DIV_TAG)) {
    if (!attribute(tag, 'class')?.split(/\s+/).includes('js-store')) continue;
    const content = attribute(tag, 'data-content');
    if (content !== undefined) return content;
  }
  return undefined;
}

interface PageStore {
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

export function extractSheet(html: string): ImportedSheet {
  const encoded = storeContent(html);
  if (encoded === undefined) throw new ImportError('No chord data found on this page.');

  let store: PageStore;
  try {
    store = JSON.parse(decodeEntities(encoded)) as PageStore;
    if (typeof store !== 'object' || store === null) throw new Error('not an object');
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
  if (typeof input.url === 'string' && isSupportedUrl(input.url)) sheet.url = input.url;
  return sheet;
}

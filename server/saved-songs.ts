// Saved link lists (urls/*.txt) and their pre-computed sheets (urls/cache/*.json).
// Used by the Vite plugin and scripts/precompute.ts; only available while the
// local server runs, never on static hosting.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  extractUltimateGuitar,
  ImportError,
  isUltimateGuitarUrl,
  labelFromUrl,
  parseUrlList,
  type ImportedSheet,
} from '../src/core/importers/ultimate-guitar';
import { songIdForUrl } from '../src/core/songs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TIMEOUT_MS = 15_000;

export interface ListedSong {
  id: string;
  list: string;
  label: string;
  url: string;
  /** A pre-computed sheet exists in urls/cache. */
  cached: boolean;
}

export interface CachedSheet extends ImportedSheet {
  url: string;
  fetchedAt: string;
}

export type FetchHtml = (url: string) => Promise<string>;

export const urlsDir = (root: string) => join(root, 'urls');
const cacheDir = (root: string) => join(urlsDir(root), 'cache');

/** File name for a link: "the-hollies__long-cool-woman-…-chords-848040.json". */
export function cacheKey(url: string): string {
  return `${songIdForUrl(url)}.json`;
}

/** Fetches an Ultimate Guitar page. Only Ultimate Guitar is allowed so this never becomes an open proxy. */
export const fetchUltimateGuitarHtml: FetchHtml = async (url) => {
  if (!isUltimateGuitarUrl(url)) throw new ImportError('Only https://tabs.ultimate-guitar.com links are supported.');
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!isUltimateGuitarUrl(response.url)) throw new Error('The link redirected away from Ultimate Guitar.');
  if (!response.ok) throw new Error(`Ultimate Guitar answered with HTTP ${response.status}.`);
  return response.text();
};

export async function readCached(root: string, url: string): Promise<CachedSheet | undefined> {
  try {
    return JSON.parse(await readFile(join(cacheDir(root), cacheKey(url)), 'utf8')) as CachedSheet;
  } catch {
    return undefined;
  }
}

async function savedUrls(root: string): Promise<{ list: string; url: string }[]> {
  const files = (await readdir(urlsDir(root)).catch(() => [])).filter((file) => file.endsWith('.txt')).sort();
  const lists = await Promise.all(
    files.map(async (file) =>
      parseUrlList(await readFile(join(urlsDir(root), file), 'utf8')).map((url) => ({
        list: basename(file, '.txt'),
        url,
      })),
    ),
  );
  return lists.flat();
}

export async function listedSongs(root: string): Promise<ListedSong[]> {
  const cached = new Set(await readdir(cacheDir(root)).catch(() => []));
  return (await savedUrls(root)).map(({ list, url }) => ({
    id: songIdForUrl(url),
    list,
    label: labelFromUrl(url),
    url,
    cached: cached.has(cacheKey(url)),
  }));
}

export interface PrecomputeResult {
  url: string;
  status: 'fetched' | 'cached' | 'failed';
  error?: string;
}

export interface PrecomputeOptions {
  /** Re-fetch links that are already cached. */
  force?: boolean;
  fetchHtml?: FetchHtml;
  /** Pause between requests, to be gentle with Ultimate Guitar. */
  delayMs?: number;
  onResult?: (result: PrecomputeResult) => void;
}

/**
 * Fetches and parses every saved link into urls/cache, and removes cache
 * files for links that are no longer saved.
 */
export async function precompute(root: string, options: PrecomputeOptions = {}): Promise<PrecomputeResult[]> {
  const { force = false, fetchHtml = fetchUltimateGuitarHtml, delayMs = 500, onResult } = options;
  const dir = cacheDir(root);
  await mkdir(dir, { recursive: true });

  const urls = [...new Set((await savedUrls(root)).map((saved) => saved.url))];
  const results: PrecomputeResult[] = [];
  let fetched = 0;
  for (const url of urls) {
    let result: PrecomputeResult;
    if (!force && (await readCached(root, url))) {
      result = { url, status: 'cached' };
    } else {
      if (fetched++ > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const sheet: CachedSheet = { url, fetchedAt: new Date().toISOString(), ...extractUltimateGuitar(await fetchHtml(url)) };
        await writeFile(join(dir, cacheKey(url)), `${JSON.stringify(sheet, null, 2)}\n`);
        result = { url, status: 'fetched' };
      } catch (error) {
        result = { url, status: 'failed', error: (error as Error).message };
      }
    }
    results.push(result);
    onResult?.(result);
  }

  const keep = new Set(urls.map(cacheKey));
  for (const file of await readdir(dir)) {
    if (file.endsWith('.json') && !keep.has(file)) await rm(join(dir, file));
  }
  return results;
}

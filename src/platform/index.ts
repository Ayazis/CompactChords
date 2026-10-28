// Browser side effects: the optional local server and printing.
// Everything here degrades gracefully when the app runs as static files.

import type { ImportedSheet } from '../core/importers/tab-site';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = (await response.json().catch(() => undefined)) as (T & { error?: string }) | undefined;
  if (!body) throw new Error('Importing by link needs the local server ("npm run dev"). Use the bookmarklet instead.');
  if (!response.ok) throw new Error(body.error ?? `Request failed (HTTP ${response.status}).`);
  return body;
}

export function importFromUrl(url: string): Promise<ImportedSheet> {
  return request(`/api/import?url=${encodeURIComponent(url)}`);
}

/** A link saved in urls/*.txt, offered by the local server. */
export interface ListedSong {
  id: string;
  list: string;
  label: string;
  url: string;
  cached: boolean;
}

/** Saved link lists, or undefined when there is no local server (static hosting). */
export async function loadListedSongs(): Promise<ListedSong[] | undefined> {
  try {
    const songs = await request<ListedSong[]>('/api/lists');
    return Array.isArray(songs) ? songs : undefined;
  } catch {
    return undefined;
  }
}

export function printSheet(): void {
  window.print();
}

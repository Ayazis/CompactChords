/** @jest-environment jsdom */
import { importFromUrl, loadListedSongs, printSheet } from '../../src/platform';
import { bookmarkletHref, IMPORT_HASH } from '../../src/platform/bookmarklet';

const APP = 'https://example.github.io/compact-chords/';
type Fetch = (path: string) => Promise<unknown>;
const stubFetch = (fetchImpl: Fetch) => ((globalThis as { fetch?: unknown }).fetch = jest.fn(fetchImpl));
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

afterEach(() => delete (globalThis as { fetch?: unknown }).fetch);

describe('importFromUrl', () => {
  it('asks the local server with an encoded link and returns the sheet', async () => {
    const fetchMock = stubFetch(async () => json(200, { text: 'G' }));
    await expect(importFromUrl('https://x.test/a b?c=d&e')).resolves.toEqual({ text: 'G' });
    expect(fetchMock).toHaveBeenCalledWith('/api/import?url=https%3A%2F%2Fx.test%2Fa%20b%3Fc%3Dd%26e');
  });

  it('shows the server message on failure', async () => {
    stubFetch(async () => json(422, { error: 'No chord data found on this page.' }));
    await expect(importFromUrl('https://x.test')).rejects.toThrow('No chord data found on this page.');
  });

  it('falls back to the HTTP status when the error has no message', async () => {
    stubFetch(async () => json(500, {}));
    await expect(importFromUrl('https://x.test')).rejects.toThrow('Request failed (HTTP 500).');
  });

  it('points to the bookmarklet when there is no local server (static hosting)', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => Promise.reject(new Error('html')) }));
    await expect(importFromUrl('https://x.test')).rejects.toThrow(/bookmarklet/);
  });

  it('points to the bookmarklet when the network call itself fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(importFromUrl('https://x.test')).rejects.toThrow('Failed to fetch');
  });
});

describe('loadListedSongs', () => {
  it('returns the lists when the local server answers', async () => {
    stubFetch(async () => json(200, [{ id: 'a' }]));
    await expect(loadListedSongs()).resolves.toEqual([{ id: 'a' }]);
  });

  it.each([
    ['a server that answers with something else', async () => json(200, { not: 'a list' })],
    ['a missing endpoint', async () => ({ ok: false, status: 404, json: async () => Promise.reject(new Error('html')) })],
    ['an error', async () => json(500, { error: 'boom' })],
    ['a network failure', async () => Promise.reject(new TypeError('offline'))],
  ])('is undefined for %s, so the app behaves as on static hosting', async (_name, impl) => {
    stubFetch(impl as Fetch);
    await expect(loadListedSongs()).resolves.toBeUndefined();
  });

  it('is undefined when fetch does not exist', async () => {
    await expect(loadListedSongs()).resolves.toBeUndefined();
  });
});

it('prints through the browser dialog', () => {
  window.print = jest.fn();
  printSheet();
  expect(window.print).toHaveBeenCalledTimes(1);
});

describe('bookmarklet details', () => {
  const run = (setup: () => void) => {
    document.body.innerHTML = '';
    setup();
    let opened: string | undefined;
    window.open = jest.fn((url?: string | URL) => ((opened = String(url)), {} as Window));
    window.confirm = jest.fn(() => false);
    new Function(decodeURIComponent(bookmarkletHref(APP).slice('javascript:'.length)))();
    return opened;
  };
  const store = (data: unknown, wrapped = true) => {
    const div = document.createElement('div');
    div.className = 'js-store';
    div.setAttribute('data-content', JSON.stringify(wrapped ? { store: { page: { data } } } : { page: { data } }));
    document.body.append(div);
  };
  const payloadOf = (opened: string) => JSON.parse(decodeURIComponent(opened.slice((APP + IMPORT_HASH).length)));

  it('is a single-line javascript: link', () => {
    const href = bookmarkletHref(APP);
    expect(href.startsWith('javascript:')).toBe(true);
    expect(decodeURIComponent(href)).not.toContain('\n');
  });

  it('survives app URLs with quotes in them', () => {
    const tricky = 'https://example.test/it\'s "here"/';
    new Function('window', 'document', 'location', decodeURIComponent(bookmarkletHref(tricky).slice('javascript:'.length)).replace(/^\(\(\) => \{/, '(() => {'));
  });

  it('copes with a store that is not wrapped in "store"', () => {
    const opened = run(() => store({ tab: { song_name: 'S', artist_name: 'A' }, tab_view: { wiki_tab: { content: 'G' } } }, false));
    expect(payloadOf(opened!)).toMatchObject({ title: 'S', artist: 'A', text: 'G' });
  });

  it('copes with missing meta and sends the page address without query or hash', () => {
    const opened = run(() => store({ tab: { song_name: 'S' }, tab_view: { wiki_tab: { content: 'G' } } }));
    expect(payloadOf(opened!)).toMatchObject({ text: 'G', url: `${location.origin}${location.pathname}` });
    expect(payloadOf(opened!).capo).toBeUndefined();
  });

  it('asks to open the app when the store has no text sheet (e.g. a pro tab)', () => {
    expect(run(() => store({ tab: { song_name: 'S' }, tab_view: {} }))).toBeUndefined();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('asks to open the app when the store is not JSON', () => {
    expect(
      run(() => {
        const div = document.createElement('div');
        div.className = 'js-store';
        div.setAttribute('data-content', '{nope');
        document.body.append(div);
      }),
    ).toBeUndefined();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('handles non-ASCII lyrics', () => {
    const opened = run(() => store({ tab: { song_name: 'Sigur Rós' }, tab_view: { wiki_tab: { content: 'Hoppípolla 日本語 🎸' } } }));
    expect(payloadOf(opened!)).toMatchObject({ title: 'Sigur Rós', text: 'Hoppípolla 日本語 🎸' });
  });
});

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImportError, TAB_ORIGIN } from '../../src/core/importers/tab-site';
import { importPlugin } from '../../server/import-plugin';
import { cacheKey, fetchSheetHtml, precompute } from '../../server/saved-songs';

const SONG = `${TAB_ORIGIN}/tab/example-band/paper-lanterns-chords-101`;
const encode = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const sheetPage = (title = 'Paper Lanterns') =>
  `<div class="js-store" data-content="${encode(
    JSON.stringify({ store: { page: { data: { tab: { song_name: title, artist_name: 'Example Band' }, tab_view: { wiki_tab: { content: '[ch]G[/ch]\nWords' } } } } } }),
  )}"></div>`;

interface Reply {
  status: number;
  body: any;
  headers: Record<string, string>;
}

/** Runs a request through the plugin's middleware without a real server. */
async function request(root: string, path: string, plugin = importPlugin()): Promise<Reply | 'next'> {
  let middleware!: (req: unknown, res: unknown, next: () => void) => Promise<void>;
  (plugin.configResolved as (config: unknown) => void)({ root });
  (plugin.configureServer as (server: unknown) => void)({ middlewares: { use: (fn: typeof middleware) => (middleware = fn) } });
  return new Promise((resolve) => {
    const reply: Reply = { status: 0, body: undefined, headers: {} };
    const res = {
      set statusCode(value: number) {
        reply.status = value;
      },
      setHeader: (name: string, value: string) => (reply.headers[name] = value),
      end: (text: string) => resolve({ ...reply, body: JSON.parse(text) }),
    };
    void middleware({ url: path }, res, () => resolve('next'));
  });
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'compact-chords-server-'));
  await mkdir(join(root, 'urls'));
});
afterEach(async () => {
  jest.restoreAllMocks();
  delete (globalThis as { fetch?: unknown }).fetch;
  await rm(root, { recursive: true, force: true });
});

describe('fetchSheetHtml', () => {
  const respond = (init: Partial<{ url: string; ok: boolean; status: number; text: string }> = {}) => {
    const fetchMock = jest.fn(async () => ({ url: init.url ?? SONG, ok: init.ok ?? true, status: init.status ?? 200, text: async () => init.text ?? 'html' }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    return fetchMock;
  };

  it('returns the page body for a supported link and sends a browser-like request', async () => {
    const fetchMock = respond();
    await expect(fetchSheetHtml(SONG)).resolves.toBe('html');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; signal: AbortSignal }];
    expect(init.headers['User-Agent']).toMatch(/Mozilla/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never fetches other sites (no open proxy)', async () => {
    const fetchMock = respond();
    for (const url of ['https://example.com/tab/a/b', 'http://tabs.example/tab', 'file:///etc/passwd', 'not a url', '']) {
      await expect(fetchSheetHtml(url)).rejects.toBeInstanceOf(ImportError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects redirects that leave the site', async () => {
    respond({ url: 'https://elsewhere.example/page' });
    await expect(fetchSheetHtml(SONG)).rejects.toThrow('redirected away');
  });

  it('reports HTTP errors', async () => {
    respond({ ok: false, status: 404 });
    await expect(fetchSheetHtml(SONG)).rejects.toThrow('HTTP 404');
  });
});

describe('import endpoint', () => {
  it('passes unrelated requests on to the next middleware', async () => {
    expect(await request(root, '/index.html')).toBe('next');
    expect(await request(root, '/api/other')).toBe('next');
  });

  it('rejects missing and unsupported links with 400', async () => {
    for (const path of ['/api/import', '/api/import?url=', `/api/import?url=${encodeURIComponent('https://example.com/x')}`]) {
      const reply = (await request(root, path)) as Reply;
      expect(reply.status).toBe(400);
      expect(reply.body.error).toMatch(/supported tab site/);
      expect(reply.headers['Content-Type']).toMatch(/application\/json/);
    }
  });

  it('serves a pre-computed sheet without fetching', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn();
    await writeFile(join(root, 'urls', 'set.txt'), `${SONG}\n`);
    await precompute(root, { fetchHtml: async () => sheetPage(), delayMs: 0 });
    const reply = (await request(root, `/api/import?url=${encodeURIComponent(SONG)}`)) as Reply;
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ url: SONG, title: 'Paper Lanterns', text: 'G\nWords' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches and parses a page that is not cached', async () => {
    (globalThis as { fetch?: unknown }).fetch = async () => ({ url: SONG, ok: true, status: 200, text: async () => sheetPage('Fresh') });
    const reply = (await request(root, `/api/import?url=${encodeURIComponent(SONG)}`)) as Reply;
    expect(reply.body).toEqual({ title: 'Fresh', artist: 'Example Band', text: 'G\nWords' });
  });

  it('answers 422 when the page has no chord sheet and 502 when it cannot be loaded', async () => {
    (globalThis as { fetch?: unknown }).fetch = async () => ({ url: SONG, ok: true, status: 200, text: async () => '<html></html>' });
    expect(((await request(root, `/api/import?url=${encodeURIComponent(SONG)}`)) as Reply).status).toBe(422);

    (globalThis as { fetch?: unknown }).fetch = async () => {
      throw new Error('network down');
    };
    const reply = (await request(root, `/api/import?url=${encodeURIComponent(SONG)}`)) as Reply;
    expect(reply.status).toBe(502);
    expect(reply.body.error).toBe('Could not load the page: network down');
  });

  it('survives a corrupt cache file by fetching again', async () => {
    await mkdir(join(root, 'urls', 'cache'));
    await writeFile(join(root, 'urls', 'cache', cacheKey(SONG)), '{broken');
    (globalThis as { fetch?: unknown }).fetch = async () => ({ url: SONG, ok: true, status: 200, text: async () => sheetPage('Again') });
    expect(((await request(root, `/api/import?url=${encodeURIComponent(SONG)}`)) as Reply).body.title).toBe('Again');
  });

  it('cannot be tricked into reading files outside the cache', async () => {
    const reply = (await request(root, `/api/import?url=${encodeURIComponent(`${TAB_ORIGIN}/tab/..%2F..%2F..%2Fetc%2Fpasswd`)}`)) as Reply;
    expect([422, 502]).toContain(reply.status);
  });
});

describe('lists endpoint', () => {
  it('lists the links of every urls/*.txt file, sorted by file name', async () => {
    await writeFile(join(root, 'urls', 'b-set.txt'), `${TAB_ORIGIN}/tab/b/song-chords-2\n`);
    await writeFile(join(root, 'urls', 'a-set.txt'), `${TAB_ORIGIN}/tab/a/song-chords-1\n# note\nhttps://example.com/x\n`);
    await writeFile(join(root, 'urls', 'readme.md'), `${TAB_ORIGIN}/tab/c/ignored-1\n`);
    const reply = (await request(root, '/api/lists')) as Reply;
    expect(reply.status).toBe(200);
    expect(reply.body.map((song: { list: string; label: string }) => [song.list, song.label])).toEqual([
      ['a-set', 'A – Song'],
      ['b-set', 'B – Song'],
    ]);
  });
});

describe('precompute edge cases', () => {
  it('lists each link once even if it appears in several files, and reports bad pages', async () => {
    await writeFile(join(root, 'urls', 'one.txt'), `${SONG}\n${SONG}\n`);
    await writeFile(join(root, 'urls', 'two.txt'), `${SONG}\n`);
    const fetched: string[] = [];
    const results = await precompute(root, {
      delayMs: 0,
      fetchHtml: async (url) => (fetched.push(url), '<html>nothing</html>'),
    });
    expect(fetched).toEqual([SONG]);
    expect(results).toEqual([{ url: SONG, status: 'failed', error: 'No chord data found on this page.' }]);
  });

  it('reports every result as it happens', async () => {
    await writeFile(join(root, 'urls', 'one.txt'), `${SONG}\n`);
    const seen: string[] = [];
    await precompute(root, { delayMs: 0, fetchHtml: async () => sheetPage(), onResult: (result) => seen.push(result.status) });
    await precompute(root, { delayMs: 0, fetchHtml: async () => sheetPage(), onResult: (result) => seen.push(result.status) });
    expect(seen).toEqual(['fetched', 'cached']);
  });

  it('waits between requests but not before the first', async () => {
    await writeFile(join(root, 'urls', 'one.txt'), `${SONG}\n${TAB_ORIGIN}/tab/b/two-chords-2\n`);
    const started = Date.now();
    await precompute(root, { delayMs: 120, fetchHtml: async () => sheetPage() });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(110);
    expect(elapsed).toBeLessThan(400);
  });
});

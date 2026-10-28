import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  cacheKey,
  libraryExportPath,
  listedSongs,
  precompute,
  readCached,
  writeLibraryExport,
} from '../../server/saved-songs';
import { DEFAULT_SHEET_SETTINGS, parseLibraryFile } from '../../src/core/songs';

const SONG_A = 'https://tabs.ultimate-guitar.com/tab/example-band/paper-lanterns-chords-101';
const SONG_B = 'https://tabs.ultimate-guitar.com/tab/other-band/harbour-light-chords-202';

const encode = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const page = (song: string) =>
  `<div class="js-store" data-content="${encode(
    JSON.stringify({
      store: { page: { data: { tab: { song_name: song }, tab_view: { wiki_tab: { content: '[ch]G[/ch]\nWords' } } } } },
    }),
  )}"></div>`;

let root: string;
let requests: string[];
const fakeFetch = async (url: string) => {
  requests.push(url);
  if (url === SONG_B) throw new Error('HTTP 404');
  return page(url === SONG_A ? 'Paper Lanterns' : 'Other');
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'compact-chords-'));
  requests = [];
  await mkdir(join(root, 'urls'));
  await writeFile(join(root, 'urls', 'set.txt'), `${SONG_A}\n# comment\n${SONG_B}\n`);
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe('cacheKey', () => {
  it('names the file after the artist and song path', () => {
    expect(cacheKey('https://tabs.ultimate-guitar.com/tab/r-e-m-/the-one-i-love-chords-803165')).toBe(
      'r-e-m-__the-one-i-love-chords-803165.json',
    );
  });
});

describe('precompute', () => {
  it('caches every saved link and reports failures', async () => {
    const results = await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(results).toEqual([
      { url: SONG_A, status: 'fetched' },
      { url: SONG_B, status: 'failed', error: 'HTTP 404' },
    ]);
    expect(await readCached(root, SONG_A)).toMatchObject({ url: SONG_A, title: 'Paper Lanterns', text: 'G\nWords' });
    expect(await readCached(root, SONG_B)).toBeUndefined();
  });

  it('skips cached links unless forced', async () => {
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    requests = [];
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(requests).toEqual([SONG_B]);

    requests = [];
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0, force: true });
    expect(requests).toEqual([SONG_A, SONG_B]);
  });

  it('removes cache files for links that are no longer saved', async () => {
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    await writeFile(join(root, 'urls', 'set.txt'), `${SONG_B}\n`);
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(await readdir(join(root, 'urls', 'cache'))).toEqual([]);
  });
});

describe('writeLibraryExport', () => {
  it('writes the cached songs as a library file the app can import', async () => {
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(await writeLibraryExport(root)).toBe(1);

    const parsed = parseLibraryFile(JSON.parse(await readFile(libraryExportPath(root), 'utf8')));
    expect(parsed?.skipped).toBe(0);
    expect(parsed?.songs).toEqual([
      {
        id: 'example-band__paper-lanterns-chords-101',
        url: SONG_A,
        title: 'Paper Lanterns',
        details: '',
        text: 'G\nWords',
        settings: DEFAULT_SHEET_SETTINGS,
        savedAt: expect.any(String),
      },
    ]);
  });

  it('survives the next precompute run', async () => {
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    await writeLibraryExport(root);
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(await readdir(join(root, 'urls', 'cache'))).toContain('library.json');
  });
});

describe('listedSongs', () => {
  it('lists saved links with their id, list name, label and cache state', async () => {
    await precompute(root, { fetchHtml: fakeFetch, delayMs: 0 });
    expect(await listedSongs(root)).toEqual([
      { id: 'example-band__paper-lanterns-chords-101', list: 'set', label: 'Example Band – Paper Lanterns', url: SONG_A, cached: true },
      { id: 'other-band__harbour-light-chords-202', list: 'set', label: 'Other Band – Harbour Light', url: SONG_B, cached: false },
    ]);
  });

  it('is empty without a urls folder', async () => {
    await rm(join(root, 'urls'), { recursive: true });
    expect(await listedSongs(root)).toEqual([]);
  });
});

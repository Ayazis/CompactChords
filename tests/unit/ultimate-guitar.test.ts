import {
  decodeEntities,
  extractUltimateGuitar,
  ImportError,
  isUltimateGuitarUrl,
  labelFromUrl,
  parseUrlList,
  sheetFromShared,
} from '../../src/core/importers/ultimate-guitar';

describe('sheetFromShared', () => {
  it('cleans a bookmarklet payload', () => {
    expect(
      sheetFromShared({
        title: '  Paper Lanterns ',
        artist: 'Example Band',
        capo: 3,
        tuning: 'E A D G B E',
        text: '[tab][ch]G[/ch]\r\nWords[/tab]',
        url: 'https://tabs.ultimate-guitar.com/tab/example-band/paper-lanterns-chords-1',
        extra: 'ignored',
      }),
    ).toEqual({
      title: 'Paper Lanterns',
      artist: 'Example Band',
      capo: 3,
      text: 'G\nWords',
      url: 'https://tabs.ultimate-guitar.com/tab/example-band/paper-lanterns-chords-1',
    });
  });

  it('drops fields that are not what they claim to be', () => {
    expect(sheetFromShared({ text: 'G', title: 42, capo: 99, url: 'https://evil.example/tab' })).toEqual({ text: 'G' });
  });

  it.each([['no text', { title: 'x' }], ['huge text', { text: 'x'.repeat(200_001) }], ['null', null]])(
    'rejects %s',
    (_case, value) => expect(sheetFromShared(value)).toBeUndefined(),
  );
});

const encode = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(data: unknown, attributeOrder: 'class-first' | 'data-first' = 'class-first'): string {
  const content = encode(JSON.stringify({ store: { page: { data } } }));
  const div =
    attributeOrder === 'class-first'
      ? `<div class="js-store" data-content="${content}"></div>`
      : `<div data-content="${content}" class="js-store"></div>`;
  return `<!doctype html><html><body><header>…</header>${div}</body></html>`;
}

const sampleData = {
  tab: { song_name: "Paper Lanterns", artist_name: 'The Example Band' },
  tab_view: {
    wiki_tab: { content: '[Verse]\r\n[tab][ch]G[/ch]     [ch]D[/ch]\r\nIt\'s a "quiet" night & more[/tab]' },
    meta: { capo: 2, tuning: { value: 'D A D G B E' } },
  },
};

describe('isUltimateGuitarUrl', () => {
  it.each([
    'https://tabs.ultimate-guitar.com/tab/the-hollies/long-cool-woman-in-a-black-dress-chords-848040',
    'https://www.ultimate-guitar.com/tab/x',
  ])('accepts %s', (url) => expect(isUltimateGuitarUrl(url)).toBe(true));

  it.each([
    'http://tabs.ultimate-guitar.com/tab/x',
    'https://ultimate-guitar.com.evil.example/tab',
    'https://localhost/tab',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s', (url) => expect(isUltimateGuitarUrl(url)).toBe(false));
});

describe('labelFromUrl', () => {
  it.each([
    ['https://tabs.ultimate-guitar.com/tab/the-hollies/long-cool-woman-in-a-black-dress-chords-848040', 'The Hollies – Long Cool Woman In A Black Dress'],
    ['https://tabs.ultimate-guitar.com/tab/r-e-m-/the-one-i-love-chords-803165', 'R E M – The One I Love'],
    ['https://tabs.ultimate-guitar.com/tab/metallica/one-tabs-8603', 'Metallica – One'],
    ['https://tabs.ultimate-guitar.com/tab/some-band/song-848040?foo=1', 'Some Band – Song'],
  ])('labels %s', (url, label) => expect(labelFromUrl(url)).toBe(label));

  it('falls back to the URL when it has no /tab/ path', () => {
    expect(labelFromUrl('https://www.ultimate-guitar.com/')).toBe('https://www.ultimate-guitar.com/');
  });
});

describe('parseUrlList', () => {
  it('keeps Ultimate Guitar links and drops everything else', () => {
    const list = '  https://tabs.ultimate-guitar.com/tab/a/b-chords-1  \r\n\n# my set\nhttps://example.com/x\nhttps://tabs.ultimate-guitar.com/tab/c/d-chords-2';
    expect(parseUrlList(list)).toEqual([
      'https://tabs.ultimate-guitar.com/tab/a/b-chords-1',
      'https://tabs.ultimate-guitar.com/tab/c/d-chords-2',
    ]);
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities once', () => {
    expect(decodeEntities('&quot;a&quot; &#039;b&#39; &#x26; &amp;lt; &bogus;')).toBe('"a" \'b\' & &lt; &bogus;');
  });
});

describe('extractUltimateGuitar', () => {
  it('returns the plain chord sheet with title, artist, capo and tuning', () => {
    expect(extractUltimateGuitar(page(sampleData))).toEqual({
      title: 'Paper Lanterns',
      artist: 'The Example Band',
      capo: 2,
      tuning: 'D A D G B E',
      text: '[Verse]\nG     D\nIt\'s a "quiet" night & more',
    });
  });

  it('works whatever the attribute order', () => {
    expect(extractUltimateGuitar(page(sampleData, 'data-first')).title).toBe('Paper Lanterns');
  });

  it('leaves out standard tuning and capo 0', () => {
    const sheet = extractUltimateGuitar(
      page({ tab_view: { wiki_tab: { content: 'G' }, meta: { capo: 0, tuning: { value: 'E A D G B E' } } } }),
    );
    expect(sheet).toEqual({ text: 'G' });
  });

  it('explains when the page has no chord data', () => {
    expect(() => extractUltimateGuitar('<html></html>')).toThrow(ImportError);
    expect(() => extractUltimateGuitar('<html></html>')).toThrow('No chord data');
  });

  it('explains when the embedded data is not JSON', () => {
    expect(() => extractUltimateGuitar('<div class="js-store" data-content="{oops"></div>')).toThrow(
      'could not be read',
    );
  });

  it('explains when the tab has no text sheet', () => {
    expect(() => extractUltimateGuitar(page({ tab_view: {} }))).toThrow('no text chord sheet');
  });
});

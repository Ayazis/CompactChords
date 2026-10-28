import {
  decodeEntities,
  extractSheet,
  ImportError,
  isSupportedUrl,
  labelFromUrl,
  parseUrlList,
  sheetFromShared,
  TAB_ORIGIN,
} from '../../src/core/importers/tab-site';

describe('sheetFromShared', () => {
  it('cleans a bookmarklet payload', () => {
    expect(
      sheetFromShared({
        title: '  Paper Lanterns ',
        artist: 'Example Band',
        capo: 3,
        tuning: 'E A D G B E',
        text: '[tab][ch]G[/ch]\r\nWords[/tab]',
        url: `${TAB_ORIGIN}/tab/example-band/paper-lanterns-chords-1`,
        extra: 'ignored',
      }),
    ).toEqual({
      title: 'Paper Lanterns',
      artist: 'Example Band',
      capo: 3,
      text: 'G\nWords',
      url: `${TAB_ORIGIN}/tab/example-band/paper-lanterns-chords-1`,
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

describe('isSupportedUrl', () => {
  it.each([
    `${TAB_ORIGIN}/tab/the-hollies/long-cool-woman-in-a-black-dress-chords-848040`,
    'https://www.ultimate-guitar.com/tab/x',
  ])('accepts %s', (url) => expect(isSupportedUrl(url)).toBe(true));

  it.each([
    'http://tabs.ultimate-guitar.com/tab/x',
    'https://ultimate-guitar.com.evil.example/tab',
    'https://localhost/tab',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s', (url) => expect(isSupportedUrl(url)).toBe(false));
});

describe('labelFromUrl', () => {
  it.each([
    [`${TAB_ORIGIN}/tab/the-hollies/long-cool-woman-in-a-black-dress-chords-848040`, 'The Hollies – Long Cool Woman In A Black Dress'],
    [`${TAB_ORIGIN}/tab/r-e-m-/the-one-i-love-chords-803165`, 'R E M – The One I Love'],
    [`${TAB_ORIGIN}/tab/metallica/one-tabs-8603`, 'Metallica – One'],
    [`${TAB_ORIGIN}/tab/some-band/song-848040?foo=1`, 'Some Band – Song'],
  ])('labels %s', (url, label) => expect(labelFromUrl(url)).toBe(label));

  it('falls back to the URL when it has no /tab/ path', () => {
    expect(labelFromUrl('https://www.ultimate-guitar.com/')).toBe('https://www.ultimate-guitar.com/');
  });
});

describe('parseUrlList', () => {
  it('keeps tab-site links and drops everything else', () => {
    const list = '  https://tabs.ultimate-guitar.com/tab/a/b-chords-1  \r\n\n# my set\nhttps://example.com/x\nhttps://tabs.ultimate-guitar.com/tab/c/d-chords-2';
    expect(parseUrlList(list)).toEqual([
      `${TAB_ORIGIN}/tab/a/b-chords-1`,
      `${TAB_ORIGIN}/tab/c/d-chords-2`,
    ]);
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities once', () => {
    expect(decodeEntities('&quot;a&quot; &#039;b&#39; &#x26; &amp;lt; &bogus;')).toBe('"a" \'b\' & &lt; &bogus;');
  });
});

describe('extractSheet', () => {
  it('returns the plain chord sheet with title, artist, capo and tuning', () => {
    expect(extractSheet(page(sampleData))).toEqual({
      title: 'Paper Lanterns',
      artist: 'The Example Band',
      capo: 2,
      tuning: 'D A D G B E',
      text: '[Verse]\nG     D\nIt\'s a "quiet" night & more',
    });
  });

  it('works whatever the attribute order', () => {
    expect(extractSheet(page(sampleData, 'data-first')).title).toBe('Paper Lanterns');
  });

  it('leaves out standard tuning and capo 0', () => {
    const sheet = extractSheet(
      page({ tab_view: { wiki_tab: { content: 'G' }, meta: { capo: 0, tuning: { value: 'E A D G B E' } } } }),
    );
    expect(sheet).toEqual({ text: 'G' });
  });

  it('explains when the page has no chord data', () => {
    expect(() => extractSheet('<html></html>')).toThrow(ImportError);
    expect(() => extractSheet('<html></html>')).toThrow('No chord data');
  });

  it('explains when the embedded data is not JSON', () => {
    expect(() => extractSheet('<div class="js-store" data-content="{oops"></div>')).toThrow(
      'could not be read',
    );
  });

  it('explains when the tab has no text sheet', () => {
    expect(() => extractSheet(page({ tab_view: {} }))).toThrow('no text chord sheet');
  });
});

describe('robustness against odd pages', () => {
  const content = encode(JSON.stringify({ store: { page: { data: { tab_view: { wiki_tab: { content: 'G' } } } } } }));

  it('keeps out-of-range numeric entities as written instead of throwing', () => {
    expect(decodeEntities('&#99999999; &#xFFFFFFFF; ok')).toBe('&#99999999; &#xFFFFFFFF; ok');
    expect(decodeEntities('&#x1F3B8;')).toBe('🎸');
  });

  it('reports valid JSON that is not an object as unreadable (ImportError, not a crash)', () => {
    for (const body of ['null', '42', '"text"', 'true']) {
      expect(() => extractSheet(`<div class="js-store" data-content="${body.replace(/"/g, '&quot;')}"></div>`)).toThrow(ImportError);
    }
  });

  it('finds the store when the element has more classes, single quotes or extra attributes', () => {
    for (const tag of [
      `<div id="x" class="foo js-store bar" data-content="${content}">`,
      `<div class='js-store' data-content='${content}'>`,
      `<DIV DATA-CONTENT="${content}" CLASS="js-store" data-x="1">`,
    ]) {
      expect(extractSheet(`<body>${tag}</div></body>`).text).toBe('G');
    }
  });

  it('ignores divs that merely look like the store', () => {
    expect(() => extractSheet(`<div class="js-store-other" data-content="${content}"></div>`)).toThrow('No chord data');
    expect(() => extractSheet(`<div class="js-store"></div>`)).toThrow('No chord data');
    expect(extractSheet(`<div class="js-store"></div><div class="js-store" data-content="${content}"></div>`).text).toBe('G');
  });

  it('refuses oversized sheets', () => {
    expect(() => extractSheet(page({ tab_view: { wiki_tab: { content: 'G\n'.repeat(150_000) } } }))).toThrow('too large');
  });

  it('ignores a malformed capo, tuning or name in the page data', () => {
    const sheet = extractSheet(
      page({ tab: { song_name: 5, artist_name: '   ' }, tab_view: { wiki_tab: { content: 'G' }, meta: { capo: '3', tuning: { value: 7 } } } }),
    );
    expect(sheet).toEqual({ text: 'G' });
  });
});

describe('sheetFromShared validation', () => {
  it.each([null, undefined, 'text', 42, [], { text: 5 }, {}, { text: 'x'.repeat(200_001) }])('rejects %p', (value) => {
    expect(sheetFromShared(value)).toBeUndefined();
  });

  it('accepts the largest allowed sheet and truncates long names', () => {
    expect(sheetFromShared({ text: 'x'.repeat(200_000) })?.text).toHaveLength(200_000);
    expect(sheetFromShared({ text: 'G', title: 'x'.repeat(500) })?.title).toHaveLength(200);
  });

  it.each([
    [0, undefined],
    [-1, undefined],
    [1, 1],
    [11, 11],
    [12, undefined],
    [2.5, undefined],
    ['3', undefined],
    [NaN, undefined],
  ])('capo %p becomes %p', (capo, expected) => {
    expect(sheetFromShared({ text: 'G', capo })?.capo).toBe(expected);
  });

  it('keeps only supported source links', () => {
    expect(sheetFromShared({ text: 'G', url: `${TAB_ORIGIN}/tab/a/b-1` })?.url).toBe(`${TAB_ORIGIN}/tab/a/b-1`);
    for (const url of ['javascript:alert(1)', 'https://evil.example/tab/a/b', 5, null]) {
      expect(sheetFromShared({ text: 'G', url })?.url).toBeUndefined();
    }
  });

  it('normalises line endings and strips markup', () => {
    expect(sheetFromShared({ text: '[ch]G[/ch]\r\n\rWords' })?.text).toBe('G\n\nWords');
  });
});

describe('labelFromUrl variants', () => {
  it.each([
    [`${TAB_ORIGIN}/tab/artist/song-ukulele-chords-12`, 'Artist – Song Ukulele'],
    [`${TAB_ORIGIN}/tab/artist/my-song-bass-tabs-12`, 'Artist – My Song Bass'],
    [`${TAB_ORIGIN}/tab/artist/my-song-chords`, 'Artist – My Song'],
    [`${TAB_ORIGIN}/tab/artist/my-song`, 'Artist – My Song'],
    [`${TAB_ORIGIN}/tab/artist/my-song-chords-12/`, 'Artist – My Song'],
    [`${TAB_ORIGIN}/tab/artist/my-song-chords-12#top`, 'Artist – My Song'],
    [`${TAB_ORIGIN}/tab/artist/song-pro-12`, 'Artist – Song Pro'],
  ])('%s → %s', (url, label) => {
    expect(labelFromUrl(url)).toBe(label);
  });
});

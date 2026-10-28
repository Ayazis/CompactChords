/** @jest-environment jsdom */
import { sheetFromShared } from '../../src/core/importers/tab-site';
import { bookmarkletHref, IMPORT_HASH, takeImportPayload } from '../../src/platform/bookmarklet';

const APP = 'https://example.github.io/compact-chords/';

function ugPage(data: unknown): void {
  document.body.innerHTML = '';
  const store = document.createElement('div');
  store.className = 'js-store';
  store.setAttribute('data-content', JSON.stringify({ store: { page: { data } } }));
  document.body.append(store);
}

/** Runs the bookmarklet the way a browser would, capturing what it opens. */
function runBookmarklet(): string | undefined {
  let opened: string | undefined;
  window.open = jest.fn((url?: string | URL) => {
    opened = String(url);
    return {} as Window;
  });
  window.alert = jest.fn();
  const code = decodeURIComponent(bookmarkletHref(APP).slice('javascript:'.length));
  new Function(code)();
  return opened;
}

describe('bookmarklet', () => {
  it('sends the chord sheet on an tab-site page to the app', () => {
    ugPage({
      tab: { song_name: 'Paper Lanterns', artist_name: 'Example Band' },
      tab_view: { wiki_tab: { content: '[ch]G[/ch]\nWords & "quotes"' }, meta: { capo: 2, tuning: { value: 'E A D G B E' } } },
    });
    const opened = runBookmarklet()!;
    expect(opened.startsWith(APP + IMPORT_HASH)).toBe(true);

    const payload = JSON.parse(decodeURIComponent(opened.slice((APP + IMPORT_HASH).length)));
    expect(sheetFromShared(payload)).toEqual({
      title: 'Paper Lanterns',
      artist: 'Example Band',
      capo: 2,
      text: 'G\nWords & "quotes"',
    });
  });

  it('tells the user when the page has no chord sheet', () => {
    document.body.innerHTML = '<p>Not a tab page</p>';
    expect(runBookmarklet()).toBeUndefined();
    expect(window.alert).toHaveBeenCalledWith('CompactChords: no chord sheet found on this page.');
  });
});

describe('takeImportPayload', () => {
  it('reads the payload and clears it from the address', () => {
    history.replaceState(null, '', `/?song=x${IMPORT_HASH}${encodeURIComponent(JSON.stringify({ text: 'G' }))}`);
    expect(takeImportPayload()).toEqual({ text: 'G' });
    expect(location.hash).toBe('');
    expect(location.search).toBe('?song=x');
  });

  it('returns null for a garbled payload and undefined without one', () => {
    history.replaceState(null, '', `/${IMPORT_HASH}%E0%A4%A`);
    expect(takeImportPayload()).toBeNull();
    expect(takeImportPayload()).toBeUndefined();
  });
});

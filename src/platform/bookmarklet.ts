// "Send to CompactChords" bookmarklet. Run on a tab-site page, it
// reads the chord sheet from the page and opens the app with it in the URL
// fragment (#import=…). Fragments never reach a server, and no backend is
// needed, so this works when the app is hosted as static files.

export const IMPORT_HASH = '#import=';

function bookmarkletBody(appUrl: string): string {
  return `(() => {
  try {
    const el = document.querySelector('.js-store');
    const raw = el ? JSON.parse(el.getAttribute('data-content')) : window.UGAPP && window.UGAPP.store;
    const data = (raw.store || raw).page.data;
    const view = data.tab_view;
    const meta = view.meta || {};
    const payload = {
      title: data.tab.song_name,
      artist: data.tab.artist_name,
      capo: meta.capo,
      tuning: meta.tuning && meta.tuning.value,
      text: view.wiki_tab.content,
      url: location.origin + location.pathname
    };
    const target = ${JSON.stringify(appUrl)} + ${JSON.stringify(IMPORT_HASH)} + encodeURIComponent(JSON.stringify(payload));
    if (!window.open(target, '_blank')) location.href = target;
  } catch (error) {
    if (confirm('CompactChords: no chord sheet found on this page. Open CompactChords instead?')) {
      if (!window.open(${JSON.stringify(appUrl)}, '_blank')) location.href = ${JSON.stringify(appUrl)};
    }
  }
})()`;
}

/** A javascript: URL to drag to the bookmarks bar. */
export function bookmarkletHref(appUrl: string): string {
  const compact = bookmarkletBody(appUrl).replace(/\n\s*/g, ' ');
  return `javascript:${encodeURIComponent(compact)}`;
}

/** Reads and clears an #import= payload, if the page was opened with one. */
export function takeImportPayload(): unknown {
  if (!location.hash.startsWith(IMPORT_HASH)) return undefined;
  const encoded = location.hash.slice(IMPORT_HASH.length);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

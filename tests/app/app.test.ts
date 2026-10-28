/** @jest-environment jsdom */
import { TAB_ORIGIN } from '../../src/core/importers/tab-site';
import { DEFAULT_SHEET_SETTINGS, type StoredSong } from '../../src/core/songs';
import { bootApp, disposeApp, type App, type ServerRoute } from './harness';

const LIBRARY_KEY = 'compact-chords.library.v1';
const LAST_KEY = 'compact-chords.last-opened';

const song = (id: string, title: string, text = 'G  D\nHello world', extra: Partial<StoredSong> = {}): StoredSong => ({
  id,
  title,
  details: '',
  text,
  settings: JSON.parse(JSON.stringify(DEFAULT_SHEET_SETTINGS)),
  savedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const library = (...songs: StoredSong[]) => ({ [LIBRARY_KEY]: JSON.stringify(songs) });

const chordsShown = (app: App) => app.$$('.sheet .chord').map((node) => node.textContent);
const buttons = (app: App) => app.$$<HTMLButtonElement>('#song-list button').map((button) => button.dataset.key);

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterEach(() => {
  disposeApp();
  jest.useRealTimers();
});

describe('starting up', () => {
  it('opens the built-in example when there is nothing else', async () => {
    const app = await bootApp();
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
    expect(app.status()).toBe('Opened the example song.');
    expect(app.$('#delete').hidden).toBe(true);
    expect(buttons(app)).toEqual(['example']);
  });

  it('opens the first library song when there is no history', async () => {
    const app = await bootApp({ storage: library(song('my__b', 'Beta'), song('my__a', 'Alpha')) });
    expect(app.$('.sheet-title').textContent).toBe('Beta');
  });

  it('prefers the last opened song, then ?song= over both', async () => {
    const songs = library(song('my__a', 'Alpha'), song('my__b', 'Beta'), song('my__c', 'Gamma'));
    expect((await bootApp({ storage: { ...songs, [LAST_KEY]: 'song:my__b' } })).$('.sheet-title').textContent).toBe('Beta');
    expect((await bootApp({ storage: { ...songs, [LAST_KEY]: 'song:my__b' }, address: '/?song=my__c' })).$('.sheet-title').textContent).toBe('Gamma');
  });

  it('falls back when ?song= or the remembered song no longer exists', async () => {
    const app = await bootApp({ storage: { ...library(song('my__a', 'Alpha')), [LAST_KEY]: 'song:gone' }, address: '/?song=missing' });
    expect(app.$('.sheet-title').textContent).toBe('Alpha');
  });

  it('survives corrupt storage', async () => {
    const app = await bootApp({ storage: { [LIBRARY_KEY]: '{not json', [LAST_KEY]: 'link:' } });
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
  });

  it('drops invalid songs from storage but keeps the valid ones', async () => {
    const app = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify([song('my__a', 'Alpha'), { id: '../x', title: 'Bad' }, 5, null]) } });
    expect(buttons(app)).toEqual(['song:my__a', 'example']);
  });

  it('hides the link form without a local server and shows it with one', async () => {
    expect((await bootApp()).$('#url-form').hidden).toBe(true);
    expect((await bootApp({ server: { '/api/lists': () => ({ body: [] }) } })).$('#url-form').hidden).toBe(false);
  });

  it('fills the capo menu with 12 options', async () => {
    const app = await bootApp();
    const options = app.$$<HTMLOptionElement>('#capo option');
    expect(options).toHaveLength(12);
    expect(options[0]!.textContent).toBe('No capo');
    expect(options[11]!.textContent).toBe('Fret 11');
  });
});

describe('editing', () => {
  it('shows the editor on demand and renders what is typed', async () => {
    const app = await bootApp();
    expect(app.$('#editor').hidden).toBe(true);
    await app.click('#edit-toggle');
    expect(app.$('#editor').hidden).toBe(false);
    expect(app.$('#edit-toggle').getAttribute('aria-pressed')).toBe('true');
    await app.type('#input', '[Verse]\nAm   F\nSome words');
    expect(chordsShown(app)).toEqual(['Am', 'F']);
    expect(app.$('.block-title').textContent).toBe('Verse');
  });

  it('keeps the title in the heading as it is typed', async () => {
    const app = await bootApp();
    await app.type('#title', 'My Song');
    expect(app.$('.sheet-title').textContent).toBe('My Song');
  });

  it('shows the empty-sheet hint for empty text', async () => {
    const app = await bootApp();
    await app.type('#input', '');
    expect(app.$$('.sheet-empty')).toHaveLength(1);
    expect(app.$('#pages').textContent).toBe('');
  });

  it('marks the song as unsaved after a change and clears it when saved', async () => {
    const app = await bootApp();
    expect(app.$('#save').classList.contains('is-dirty')).toBe(false);
    await app.type('#title', 'Mine');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
    await app.click('#save');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(false);
  });

  it('asks before leaving unsaved changes and keeps the song when declined', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.type('#title', 'Edited');
    app.confirm.mockReturnValue(false);
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(app.confirm).toHaveBeenCalledWith('Discard unsaved changes to “Edited”?');
    expect(app.$('.sheet-title').textContent).toBe('Edited');
  });

  it('opens another song after confirming the discard', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.type('#title', 'Edited');
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(app.$('.sheet-title').textContent).toBe('Beta');
  });

  it('does not ask when nothing changed', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(app.confirm).not.toHaveBeenCalled();
  });

  it('warns on closing the tab only while there are unsaved changes', async () => {
    const app = await bootApp();
    const close = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(close()).toBe(false);
    await app.type('#input', 'G');
    expect(close()).toBe(true);
  });
});

describe('saving and the library', () => {
  it('refuses to save without a title', async () => {
    const app = await bootApp();
    await app.click('#new-song');
    await app.click('#save');
    expect(app.status()).toBe('Give the song a title before saving.');
    expect(app.stored()).toEqual([]);
  });

  it('refuses a title that gives no usable id only when it really has no letters or digits', async () => {
    const app = await bootApp();
    await app.click('#new-song');
    await app.type('#title', '?!');
    await app.click('#save');
    expect(app.status()).toBe('Give the song a title before saving.');
  });

  it('saves a song with Japanese title (no Latin characters)', async () => {
    const app = await bootApp();
    await app.type('#title', '日本語の歌');
    await app.click('#save');
    expect(app.status()).toBe('Saved “日本語の歌” to your library.');
    expect(app.stored()).toHaveLength(1);
  });

  it('saves title, text and settings, then lists the song and offers delete', async () => {
    const app = await bootApp();
    await app.click('#edit-toggle');
    await app.type('#title', 'Sigur Rós – Hoppípolla');
    await app.type('#input', 'C  G\nWords here');
    await app.click('#transpose-up');
    await app.click('#save');
    expect(app.status()).toBe('Saved “Sigur Rós – Hoppípolla” to your library.');
    expect(app.stored()).toMatchObject([
      { id: 'my__sigur__ros__hoppipolla', title: 'Sigur Rós – Hoppípolla', text: 'C  G\nWords here', settings: { transpose: 1 } },
    ]);
    expect(buttons(app)).toContain('song:my__sigur__ros__hoppipolla');
    expect(app.$('#delete').hidden).toBe(false);
    expect(location.search).toBe('?song=my__sigur__ros__hoppipolla');
  });

  it('keeps saving under the same id when the title is edited later', async () => {
    const app = await bootApp();
    await app.type('#title', 'First');
    await app.click('#save');
    await app.type('#title', 'Second');
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ id: 'my__first', title: 'Second' }]);
  });

  it('asks before replacing a different song that has the same title', async () => {
    const app = await bootApp({ storage: library(song('my__alpha', 'Alpha', 'C\nold')) });
    await app.click('#new-song');
    await app.type('#title', 'Alpha');
    await app.type('#input', 'D\nnew');
    app.confirm.mockReturnValue(false);
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ text: 'C\nold' }]);
    app.confirm.mockReturnValue(true);
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ text: 'D\nnew' }]);
  });

  it('lists library songs alphabetically with their transpose and capo', async () => {
    const withSettings = song('my__b', 'Beta');
    withSettings.settings.transpose = -2;
    withSettings.settings.capo = 3;
    const app = await bootApp({ storage: library(withSettings, song('my__a', 'alpha'), song('my__c', 'Charlie')) });
    expect(buttons(app).slice(0, 3)).toEqual(['song:my__a', 'song:my__b', 'song:my__c']);
    expect(app.$('[data-key="song:my__b"]').textContent).toContain('−2 · capo 3');
  });

  it('restores the saved settings when a song is reopened', async () => {
    const saved = song('my__a', 'Alpha', 'C  G\nHello');
    Object.assign(saved.settings, { transpose: 2, capo: 1, columns: 3, accidentals: 'flat', showTabs: false, chordPx: 14, lyricPx: 9 });
    const app = await bootApp({ storage: library(saved) });
    expect(app.$<HTMLSelectElement>('#capo').value).toBe('1');
    expect(app.$('#transpose-value').textContent).toBe('+2');
    expect(app.$<HTMLInputElement>('input[name="columns"][value="3"]').checked).toBe(true);
    expect(app.$<HTMLInputElement>('input[name="accidentals"][value="flat"]').checked).toBe(true);
    expect(app.$<HTMLInputElement>('#show-tabs').checked).toBe(false);
    expect(app.$<HTMLInputElement>('#chord-size').value).toBe('14');
    expect(app.$('#lyric-size-value').textContent).toBe('9px');
  });

  it('deletes after confirmation and keeps the song open, unsaved', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha')) });
    app.confirm.mockReturnValue(false);
    await app.click('#delete');
    expect(app.stored()).toHaveLength(1);
    app.confirm.mockReturnValue(true);
    await app.click('#delete');
    expect(app.stored()).toEqual([]);
    expect(app.$('.sheet-title').textContent).toBe('Alpha');
    expect(app.$('#delete').hidden).toBe(true);
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ id: 'my__a' }]);
  });

  it('starts a blank song, focused on the title and with the editor open', async () => {
    const app = await bootApp();
    await app.click('#new-song');
    expect(app.$('#editor').hidden).toBe(false);
    expect(document.activeElement).toBe(app.$('#title'));
    expect(app.$<HTMLTextAreaElement>('#input').value).toBe('');
    expect(app.$<HTMLInputElement>('#title').value).toBe('');
  });

  it('asks before replacing unsaved work with a new song', async () => {
    const app = await bootApp();
    await app.type('#input', 'G');
    app.confirm.mockReturnValue(false);
    await app.click('#new-song');
    expect(app.$<HTMLTextAreaElement>('#input').value).toBe('G');
  });

  it('reports full storage instead of losing the song silently', async () => {
    const app = await bootApp();
    await app.type('#title', 'Mine');
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await app.click('#save');
    spy.mockRestore();
    expect(app.status()).toBe('Could not save: browser storage is full or turned off.');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
  });

  it('remembers the last opened song', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(localStorage.getItem(LAST_KEY)).toBe('song:my__b');
  });
});

describe('searching the library', () => {
  const songs = library(song('my__a', 'Alpha'), song('my__b', 'Beta'), song('my__c', 'Bravo'));

  it('filters by title, case-insensitively', async () => {
    const app = await bootApp({ storage: songs });
    await app.type('#search', 'BRA');
    expect(buttons(app)).toEqual(['song:my__c']);
  });

  it('says so when nothing matches', async () => {
    const app = await bootApp({ storage: songs });
    await app.type('#search', 'zzz');
    expect(app.$('.empty-note').textContent).toBe('No songs match your search.');
  });

  it('Enter opens the first match', async () => {
    const app = await bootApp({ storage: songs });
    await app.type('#search', 'bet');
    app.$('#search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await app.settle();
    expect(app.$('.sheet-title').textContent).toBe('Beta');
  });

  it('the / shortcut focuses the search box, but not while typing elsewhere', async () => {
    const app = await bootApp({ storage: songs });
    await app.press('/');
    expect(document.activeElement).toBe(app.$('#search'));
    app.$('#title').focus();
    await app.press('/');
    expect(document.activeElement).toBe(app.$('#title'));
  });
});

describe('transposing', () => {
  const chords = (app: App) => chordsShown(app).join(' ');

  it('steps up and down with the buttons and shows the shift', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'G  D  Em  C\nwords words words words')) });
    await app.click('#transpose-up');
    expect(app.$('#transpose-value').textContent).toBe('+1');
    expect(chords(app)).toBe('Ab Eb Fm Db');
    await app.click('#transpose-down');
    await app.click('#transpose-down');
    expect(app.$('#transpose-value').textContent).toBe('−1');
    expect(chords(app)).toBe('F# C# D#m B');
  });

  it('wraps around at ±11 and resets', async () => {
    const app = await bootApp();
    for (let i = 0; i < 12; i++) await app.click('#transpose-up');
    expect(app.$('#transpose-value').textContent).toBe('0');
    for (let i = 0; i < 12; i++) await app.click('#transpose-down');
    expect(app.$('#transpose-value').textContent).toBe('0');
    await app.click('#transpose-up');
    await app.click('#transpose-reset');
    expect(app.$('#transpose-value').textContent).toBe('0');
  });

  it('transposes with Alt+Arrow shortcuts', async () => {
    const app = await bootApp();
    await app.press('ArrowUp', { altKey: true });
    await app.press('ArrowUp', { altKey: true });
    await app.press('ArrowDown', { altKey: true });
    expect(app.$('#transpose-value').textContent).toBe('+1');
  });

  it('uses flats in flat keys and honours the accidentals choice', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C  F  G  C\nwords words words words')) });
    await app.click('#transpose-up');
    await app.click('#transpose-up');
    await app.click('#transpose-up');
    await app.click('#transpose-up');
    await app.click('#transpose-up');
    expect(chords(app)).toBe('F Bb C F');
    await app.click('input[name="accidentals"][value="sharp"]');
    expect(chords(app)).toBe('F A# C F');
  });

  it('keeps the heading and key panel in step with transpose and capo', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C  F  G  C\nwords words words words')) });
    expect(app.$('.sheet-details').textContent).toBe('Key C');
    await app.click('#transpose-up');
    await app.click('#transpose-up');
    expect(app.$('.sheet-details').textContent).toBe('Key D');
    expect(app.$('#keys').textContent).toBe('OriginalCSounds inD');
    const capo = app.$<HTMLSelectElement>('#capo');
    capo.value = '2';
    capo.dispatchEvent(new Event('change', { bubbles: true }));
    await app.settle();
    expect(chords(app)).toBe('C F G C');
    expect(app.$('.sheet-details').textContent).toBe('Capo 2 · Key D');
    expect(app.$('#keys').textContent).toContain('Play shapesC (capo 2)');
  });

  it('shows a dash for songs without chords', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'just words')) });
    expect(app.$('#keys').textContent).toBe('Key—');
  });

  it('does not touch lyrics', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C  G\nA song of Cats and Dogs')) });
    await app.click('#transpose-up');
    expect(app.$$('.sheet .lyric').map((node) => node.textContent).join('')).toBe('A song of Cats and Dogs');
  });
});

describe('sheet settings', () => {
  it('changes columns, sizes and tab visibility', async () => {
    const app = await bootApp();
    await app.click('input[name="columns"][value="3"]');
    expect(app.$('#sheet').style.getPropertyValue('--columns')).toBe('3');
    const size = app.$<HTMLInputElement>('#chord-size');
    size.value = '16';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settle();
    expect(app.$('#sheet').style.getPropertyValue('--chord-size')).toBe('16px');
    expect(app.$('#chord-size-value').textContent).toBe('16px');
    expect(app.$$('.row.tab').length).toBeGreaterThan(0);
    await app.click('#show-tabs');
    expect(app.$$('.row.tab')).toHaveLength(0);
  });

  it('hides sections and removes chords per section', async () => {
    const app = await bootApp();
    const intro = app.$<HTMLInputElement>('input[data-block="B0"][data-role="visible"]');
    intro.checked = false;
    intro.dispatchEvent(new Event('change', { bubbles: true }));
    await app.settle();
    expect(app.$$('.block-title').map((node) => node.textContent)).not.toContain('Intro');
    expect(app.$<HTMLInputElement>('input[data-block="B0"][data-role="chords"]').disabled).toBe(true);

    const verse = app.$<HTMLInputElement>('input[data-block="B1"][data-role="chords"]');
    verse.checked = false;
    verse.dispatchEvent(new Event('change', { bubbles: true }));
    await app.settle();
    const verseBlock = app.$$('.block').find((block) => block.querySelector('.block-title')?.textContent === 'Verse 1')!;
    expect(verseBlock.querySelector('.chord')).toBeNull();
    expect(verseBlock.textContent).toContain('Paper lanterns');
  });

  it('keeps keyboard focus on the toggled control', async () => {
    const app = await bootApp();
    const box = app.$<HTMLInputElement>('input[data-block="B1"][data-role="chords"]');
    box.focus();
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await app.settle();
    expect((document.activeElement as HTMLElement).dataset.focusKey).toBe('chords:B1');
  });

  it('reports the page count', async () => {
    const app = await bootApp();
    expect(app.$('#pages').textContent).toBe('About 1 A4 page');
  });
});

describe('printing', () => {
  it('opens the print dialog from the button', async () => {
    const app = await bootApp();
    await app.click('#print');
    expect(app.print).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard shortcuts', () => {
  it('Ctrl+S saves (and Cmd+S too) without the browser dialog', async () => {
    const app = await bootApp();
    await app.type('#title', 'Quick');
    await app.press('s', { ctrlKey: true });
    expect(app.stored()).toHaveLength(1);
    await app.type('#title', 'Quick 2');
    await app.press('S', { metaKey: true });
    expect(app.stored()).toMatchObject([{ title: 'Quick 2' }]);
  });

  it('Ctrl+E toggles the editor and focuses it', async () => {
    const app = await bootApp();
    await app.press('e', { ctrlKey: true });
    expect(app.$('#editor').hidden).toBe(false);
    expect(document.activeElement).toBe(app.$('#input'));
    await app.press('e', { ctrlKey: true });
    expect(app.$('#editor').hidden).toBe(true);
  });
});

describe('drawers on narrow screens', () => {
  it('opens and closes the library and settings, with a shared scrim', async () => {
    const app = await bootApp();
    await app.click('#toggle-library');
    expect(app.$('#library').hasAttribute('data-open')).toBe(true);
    expect(app.$('#scrim').hidden).toBe(false);
    await app.click('#toggle-settings');
    await app.click('#scrim');
    expect(app.$('#library').hasAttribute('data-open')).toBe(false);
    expect(app.$('#settings').hasAttribute('data-open')).toBe(false);
    expect(app.$('#scrim').hidden).toBe(true);
    await app.click('#toggle-library');
    await app.press('Escape');
    expect(app.$('#toggle-library').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the library after picking a song', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.click('#toggle-library');
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(app.$('#library').hasAttribute('data-open')).toBe(false);
  });
});

describe('backup and restore', () => {
  const fileOf = (name: string, content: string) => ({ name, text: async () => content }) as unknown as File;
  const pick = async (app: App, file: File) => {
    const input = app.$<HTMLInputElement>('#import-library');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await app.settle();
  };

  it('refuses to export an empty library', async () => {
    const app = await bootApp();
    await app.click('#export-library');
    expect(app.status()).toBe('Your library is empty; save a song first.');
  });

  it('exports every song as a JSON download', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (value: Blob) => ((blob = value), 'blob:x');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await app.click('#export-library');
    click.mockRestore();
    expect(app.status()).toBe('Exported 2 songs.');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(JSON.parse(text)).toMatchObject({ format: 'compact-chords-library', version: 1, songs: [{ id: 'my__a' }, { id: 'my__b' }] });
  });

  it('imports a backup, reporting new, updated and skipped songs', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'old')) });
    const backup = JSON.stringify({
      format: 'compact-chords-library',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      songs: [song('my__a', 'Alpha', 'new'), song('my__z', 'Zulu'), { id: '../bad' }],
    });
    await pick(app, fileOf('backup.json', backup));
    expect(app.status()).toBe('Imported library: 1 new, 1 updated, 1 skipped.');
    expect(app.stored()).toMatchObject([{ id: 'my__a', text: 'new' }, { id: 'my__z' }]);
    expect(buttons(app)).toContain('song:my__z');
  });

  it('rejects files that are not a library', async () => {
    const app = await bootApp();
    await pick(app, fileOf('notes.json', '{"hello":1}'));
    expect(app.status()).toBe('notes.json is not a CompactChords library file.');
    await pick(app, fileOf('broken.json', 'nope'));
    expect(app.status()).toBe('broken.json is not a CompactChords library file.');
    expect(app.stored()).toEqual([]);
  });
});

describe('sending a song from the tab site (bookmarklet)', () => {
  const payload = (data: unknown) => `/#import=${encodeURIComponent(JSON.stringify(data))}`;
  const sent = { title: 'Harbour Light', artist: 'Other Band', capo: 2, tuning: 'D A D G B E', text: '[ch]Am[/ch]  [ch]F[/ch]\nWords', url: `${TAB_ORIGIN}/tab/other-band/harbour-light-chords-202` };

  it('opens the sent song with its details and a source link', async () => {
    const app = await bootApp({ address: payload(sent) });
    expect(app.$('.sheet-title').textContent).toBe('Other Band – Harbour Light');
    expect(chordsShown(app)).toEqual(['Am', 'F']);
    expect(app.$('.sheet-details').textContent).toContain('Capo 2 · Tuning D A D G B E');
    expect(app.status()).toBe('Imported “Harbour Light” from the tab site. Save it to keep it.');
    expect(location.hash).toBe('');
  });

  it('saves it under an id derived from its link', async () => {
    const app = await bootApp({ address: payload(sent) });
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ id: 'other-band__harbour-light-chords-202', url: sent.url }]);
  });

  it('works without a link or title', async () => {
    const app = await bootApp({ address: payload({ text: 'G\nhi' }) });
    expect(app.status()).toBe('Imported “song” from the tab site. Save it to keep it.');
    await app.type('#title', 'Mine');
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ id: 'my__mine' }]);
  });

  it('reports a payload it cannot use and still opens something', async () => {
    const app = await bootApp({ address: payload({ nothing: true }) });
    expect(app.status()).toBe('The bookmarklet did not send a chord sheet.');
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
  });

  it('accepts a song sent to a tab that is already open', async () => {
    const app = await bootApp();
    location.hash = payload({ title: 'Later', text: 'G' }).slice(1);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await app.settle();
    expect(app.$('.sheet-title').textContent).toBe('Later');
  });

  it('asks before replacing unsaved work with a sent song', async () => {
    const app = await bootApp();
    await app.type('#title', 'Working on it');
    app.confirm.mockReturnValue(false);
    location.hash = payload({ title: 'Later', text: 'G' }).slice(1);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await app.settle();
    expect(app.$('.sheet-title').textContent).toBe('Working on it');
  });

  it('shows the bookmarklet link with instructions on click', async () => {
    const app = await bootApp();
    expect(app.$<HTMLAnchorElement>('#bookmarklet').getAttribute('href')).toMatch(/^javascript:/);
    await app.click('#bookmarklet');
    expect(app.status()).toMatch(/Drag this link/);
  });
});

describe('importing by link (local server)', () => {
  const url = `${TAB_ORIGIN}/tab/example-band/paper-lanterns-chords-101`;
  const listed = { id: 'example-band__paper-lanterns-chords-101', list: 'Farm', label: 'Example Band – Paper Lanterns', url, cached: true };
  const server = (over: Record<string, ServerRoute> = {}): Record<string, ServerRoute> => ({
    '/api/lists': () => ({ body: [listed] }),
    '/api/import': () => ({ body: { title: 'Paper Lanterns', artist: 'Example Band', text: 'G  D\nWords' } }),
    ...over,
  });

  it('lists saved links in their group and opens the first one when nothing else is there', async () => {
    const app = await bootApp({ server: server() });
    expect(app.$$('.song-group-title').map((node) => node.textContent)).toEqual(['Farm', 'Built-in']);
    expect(app.$('.sheet-title').textContent).toBe('Example Band – Paper Lanterns');
    expect(app.requests.some((request) => request.startsWith('/api/import?url='))).toBe(true);
  });

  it('marks a listed song as saved once it is in the library, and opens the saved copy', async () => {
    const saved = song(listed.id, 'Example Band – Paper Lanterns', 'C\nmine', { url });
    const app = await bootApp({ server: server(), storage: library(saved) });
    expect(app.$$(`[data-key="song:${listed.id}"]`).map((node) => node.textContent).join('|')).toContain('saved');
    expect(app.$$('[data-key^="link:"]')).toHaveLength(0);
    expect(app.sheetText()).toContain('mine');
    expect(app.requests.filter((request) => request.startsWith('/api/import'))).toHaveLength(0);
  });

  it('imports a pasted link through the form', async () => {
    const app = await bootApp({ server: { '/api/lists': () => ({ body: [] }), '/api/import': server()['/api/import']! } });
    await app.type('#url', url);
    app.$('#url-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await app.settle();
    expect(app.status()).toBe('Imported “Paper Lanterns”. Save it to keep your settings.');
    expect(location.search).toBe(`?url=${encodeURIComponent(url)}`);
    expect(app.$<HTMLButtonElement>('#url-form button').disabled).toBe(false);
  });

  it('shows the server error for an unsupported link and leaves the open song alone', async () => {
    const app = await bootApp({
      server: { '/api/lists': () => ({ body: [] }), '/api/import': () => ({ status: 400, body: { error: 'Only links from the supported tab site can be imported.' } }) },
    });
    await app.type('#url', 'https://example.com/tab/a/b');
    app.$('#url-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await app.settle();
    expect(app.status()).toBe('Only links from the supported tab site can be imported.');
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
  });

  it('rejects text that is not a link without calling the server', async () => {
    const app = await bootApp({ server: server() });
    const before = app.requests.length;
    await app.type('#url', 'not a link');
    app.$('#url-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await app.settle();
    expect(app.status()).toBe('That is not a valid link.');
    expect(app.requests.length).toBe(before);
  });

  it('opens a link from ?url=', async () => {
    const app = await bootApp({ server: server(), address: `/?url=${encodeURIComponent(url)}` });
    expect(app.$('.sheet-title').textContent).toBe('Example Band – Paper Lanterns');
  });

  it('keeps going when a listed link cannot be loaded', async () => {
    const app = await bootApp({ server: server({ '/api/import': () => ({ status: 502, body: { error: 'Could not load the page: HTTP 404' } }) }) });
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
  });
});

describe('fit to one page', () => {
  /** jsdom has no layout; pretend a sheet is as tall as its rows times the font size. */
  function fakeLayout(heightPerPx: number) {
    return jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.id !== 'sheet') return 0;
      const lyric = parseFloat(this.style.getPropertyValue('--lyric-size'));
      return this.querySelectorAll('.row').length * lyric * heightPerPx;
    });
  }

  it('picks the largest size that fits and reports it', async () => {
    const spy = fakeLayout(4);
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C  G\nwords words\n'.repeat(20))) });
    await app.click('#fit');
    spy.mockRestore();
    const lyric = Number(app.$<HTMLInputElement>('#lyric-size').value);
    expect(lyric).toBeGreaterThan(6);
    expect(lyric).toBeLessThan(24);
    expect(app.status()).toMatch(/^Fitted to one page: lyrics [\d.]+px, chords [\d.]+px\./);
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
  });

  it('goes up to the maximum for a very short song', async () => {
    const spy = fakeLayout(0.01);
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C\nhi')) });
    await app.click('#fit');
    spy.mockRestore();
    expect(app.$<HTMLInputElement>('#lyric-size').value).toBe('24');
  });

  it('explains and restores the old sizes when even the smallest size is too big', async () => {
    const spy = fakeLayout(100);
    const app = await bootApp({ storage: library(song('my__a', 'Alpha', 'C\nhi\n'.repeat(30))) });
    await app.click('#fit');
    spy.mockRestore();
    expect(app.status()).toMatch(/^Too long for one page/);
    expect(app.$<HTMLInputElement>('#lyric-size').value).toBe('12');
    expect(app.$<HTMLInputElement>('#chord-size').value).toBe('12');
  });
});

describe('regressions', () => {
  it('searching "library" or other group names does not match every built-in song', async () => {
    const app = await bootApp({ storage: library(song('my__a', 'Alpha'), song('my__b', 'Beta')) });
    await app.type('#search', 'lib');
    expect(buttons(app)).toEqual([]);
    await app.type('#search', 'built');
    expect(buttons(app)).toEqual([]);
  });

  it('still finds saved-list songs by the name of their list', async () => {
    const listed = { id: 'a__b', list: 'TheFarm', label: 'Band – Song', url: `${TAB_ORIGIN}/tab/a/b`, cached: false };
    const app = await bootApp({ server: { '/api/lists': () => ({ body: [listed] }), '/api/import': () => ({ body: { text: 'G' } }) } });
    await app.type('#search', 'farm');
    expect(buttons(app)).toEqual(['link:' + listed.url]);
  });

  it('keeps the "bookmarklet sent nothing usable" error visible after falling back to another song', async () => {
    const app = await bootApp({
      storage: { ...library(song('my__a', 'Alpha')), [LAST_KEY]: 'song:my__a' },
      address: `/#import=${encodeURIComponent('{"nothing":1}')}`,
    });
    expect(app.status()).toBe('The bookmarklet did not send a chord sheet.');
    expect(app.$('.sheet-title').textContent).toBe('Alpha');
  });

  it('reports a garbled #import= payload too', async () => {
    const app = await bootApp({ address: '/#import=%7Bbroken' });
    expect(app.status()).toBe('The bookmarklet did not send a chord sheet.');
  });

  it('can save a sent song whose link has no song path, by title', async () => {
    const app = await bootApp({ address: `/#import=${encodeURIComponent(JSON.stringify({ title: 'Home', text: 'G\nhi', url: `${TAB_ORIGIN}/` }))}` });
    await app.click('#save');
    expect(app.status()).toBe('Saved “Home” to your library.');
    expect(app.stored()).toMatchObject([{ id: 'my__home' }]);
  });

  it('can save a song whose link is very long (ids stay valid, so it survives a reload)', async () => {
    const url = `${TAB_ORIGIN}/tab/${'a'.repeat(100)}/${'b'.repeat(100)}-chords-1`;
    const app = await bootApp({ address: `/#import=${encodeURIComponent(JSON.stringify({ title: 'Long', text: 'G\nhi', url }))}` });
    await app.click('#save');
    const reloaded = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify(app.stored()) } });
    expect(reloaded.$('.sheet-title').textContent).toBe('Long');
  });
});

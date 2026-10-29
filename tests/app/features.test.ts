/** @jest-environment jsdom */
import { DEFAULT_SHEET_SETTINGS, parseSettings, type StoredSong } from '../../src/core/songs';
import { DEFAULT_SETTINGS, expandBanner, renderSheet } from '../../src/ui/render';
import { bootApp, disposeApp, type App } from './harness';

const LIBRARY_KEY = 'compact-chords.library.v1';
const THEME_KEY = 'compact-chords.theme';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const song = (id: string, patch: Partial<StoredSong['settings']> = {}): StoredSong => ({
  id,
  title: id,
  details: '',
  text: '[Verse]\nG  D\nHello world\n\n[Chorus]\nC  G\nMore words',
  settings: { ...clone(DEFAULT_SHEET_SETTINGS), ...patch },
  savedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterEach(() => {
  disposeApp();
  jest.useRealTimers();
});

const set = async (app: App, selector: string, value: string, event = 'input') => {
  const field = app.$<HTMLInputElement>(selector);
  field.value = value;
  field.dispatchEvent(new Event(event, { bubbles: true }));
  await app.settle();
};

describe('chord colour', () => {
  it('colours chords with the chosen colour and shows it in the picker', async () => {
    const app = await bootApp();
    await set(app, '#chord-color', '#cc0000');
    expect(app.$('#sheet').style.getPropertyValue('--chord-color')).toBe('#cc0000');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
  });

  it('goes back to the theme colour with Default', async () => {
    const app = await bootApp();
    await set(app, '#chord-color', '#cc0000');
    await app.click('#chord-color-reset');
    expect(app.$('#sheet').style.getPropertyValue('--chord-color')).toBe('');
  });

  it('is saved with the song and restored', async () => {
    const app = await bootApp();
    await app.click('#new-song');
    await app.type('#title', 'Colourful');
    await app.type('#input', 'G\nhi');
    await set(app, '#chord-color', '#00aa55');
    await app.click('#save');
    expect(app.stored()).toMatchObject([{ settings: { chordColor: '#00aa55' } }]);
    const again = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify(app.stored()) } });
    expect(again.$('#sheet').style.getPropertyValue('--chord-color')).toBe('#00aa55');
    expect(again.$<HTMLInputElement>('#chord-color').value).toBe('#00aa55');
  });

  it('uses the starting colour in the picker for songs on auto', async () => {
    expect((await bootApp()).$<HTMLInputElement>('#chord-color').value).toBe('#1f3fb0');
  });
});

describe('space between sections', () => {
  it('starts at 2em', async () => {
    const app = await bootApp();
    expect(app.$('#sheet').style.getPropertyValue('--section-gap')).toBe('2em');
    expect(app.$('#section-gap-value').textContent).toBe('2em');
  });

  it('changes the gap and shows its value', async () => {
    const app = await bootApp();
    await set(app, '#section-gap', '1.5');
    expect(app.$('#sheet').style.getPropertyValue('--section-gap')).toBe('1.5em');
    expect(app.$('#section-gap-value').textContent).toBe('1.5em');
  });

  it('can be removed entirely and is restored from a saved song', async () => {
    const app = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify([song('my__a', { sectionGap: 0 })]) } });
    expect(app.$('#sheet').style.getPropertyValue('--section-gap')).toBe('0em');
    expect(app.$<HTMLInputElement>('#section-gap').value).toBe('0');
  });

  it('is used by the stylesheet for blocks and continuations', () => {
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/ui/style.css'), 'utf8') as string;
    expect(css).toMatch(/\.block\s*{[^}]*margin-top:\s*var\(--section-gap/);
    expect(css).toMatch(/\.block\.continuation\s*{[^}]*var\(--section-gap/);
  });
});

describe('header and footer', () => {
  it('shows header above the title and footer after the content', async () => {
    const app = await bootApp();
    await set(app, '#header-text', 'The Band');
    await set(app, '#footer-text', 'Page one');
    const children = [...app.$('#sheet').children].map((node) => node.className);
    expect(children[0]).toBe('sheet-banner top');
    expect(children[children.length - 1]).toBe('sheet-banner bottom');
    expect(app.$('.sheet-banner.top').textContent).toBe('The Band');
    expect(app.$('.sheet-banner.bottom').textContent).toBe('Page one');
  });

  it('puts today\'s date in for {date}', async () => {
    const app = await bootApp();
    await set(app, '#footer-text', 'The Band · {date}');
    expect(app.$('.sheet-banner.bottom').textContent).toMatch(/^The Band · \d{4}-\d{2}-\d{2}$/);
  });

  it('shows neither when blank or only spaces', async () => {
    const app = await bootApp();
    await set(app, '#header-text', '   ');
    expect(app.$$('.sheet-banner')).toHaveLength(0);
  });

  it('is saved with the song, restored in the fields, and shown as plain text', async () => {
    const app = await bootApp();
    await app.click('#new-song');
    await app.type('#title', 'Banner');
    await app.type('#input', 'G\nhi');
    await set(app, '#header-text', '<b>Band</b>');
    await set(app, '#footer-text', 'Fin');
    await app.click('#save');
    const again = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify(app.stored()) } });
    expect(again.$<HTMLInputElement>('#header-text').value).toBe('<b>Band</b>');
    expect(again.$<HTMLInputElement>('#footer-text').value).toBe('Fin');
    expect(again.$('.sheet-banner.top').textContent).toBe('<b>Band</b>');
    expect(document.querySelector('.sheet-banner b')).toBeNull();
  });

  it('is not carried over to the next song', async () => {
    const app = await bootApp({ storage: { [LIBRARY_KEY]: JSON.stringify([song('my__a'), song('my__b')]) } });
    await set(app, '#header-text', 'Only here');
    await app.click('#song-list button[data-key="song:my__b"]');
    expect(app.$<HTMLInputElement>('#header-text').value).toBe('');
    expect(app.$$('.sheet-banner')).toHaveLength(0);
  });

  it('expandBanner is case-insensitive, handles repeats, and uses the given date', () => {
    const day = new Date(2026, 0, 5);
    expect(expandBanner('{date} / {DATE} / {dates}', day)).toBe('2026-01-05 / 2026-01-05 / {dates}');
    expect(expandBanner('none', day)).toBe('none');
  });

  it('renderSheet leaves the footer out of an empty sheet', () => {
    const root = document.createElement('article');
    renderSheet(root, [], { title: '', details: '' }, { ...DEFAULT_SETTINGS, footerText: 'x', headerText: 'h' });
    expect(root.querySelectorAll('.sheet-banner.bottom')).toHaveLength(0);
    expect(root.querySelectorAll('.sheet-banner.top')).toHaveLength(1);
  });
});

describe('light and dark mode', () => {
  const theme = () => document.documentElement.getAttribute('data-theme');

  it('starts on automatic (system) and applies a choice to the whole page', async () => {
    const app = await bootApp();
    expect(theme()).toBeNull();
    expect(app.$<HTMLInputElement>('input[name="theme"][value="auto"]').checked).toBe(true);
    await app.click('input[name="theme"][value="dark"]');
    expect(theme()).toBe('dark');
    await app.click('input[name="theme"][value="light"]');
    expect(theme()).toBe('light');
    await app.click('input[name="theme"][value="auto"]');
    expect(theme()).toBeNull();
  });

  it('remembers the choice for next time, without marking the song as changed', async () => {
    const app = await bootApp();
    await app.click('input[name="theme"][value="dark"]');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(false);
    const again = await bootApp({ storage: { [THEME_KEY]: 'dark' } });
    expect(theme()).toBe('dark');
    expect(again.$<HTMLInputElement>('input[name="theme"][value="dark"]').checked).toBe(true);
  });

  it('ignores a corrupt stored value and survives unavailable storage', async () => {
    await bootApp({ storage: { [THEME_KEY]: 'purple' } });
    expect(theme()).toBeNull();
    const app = await bootApp();
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await app.click('input[name="theme"][value="dark"]');
    spy.mockRestore();
    expect(theme()).toBe('dark');
  });

  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/ui/style.css'), 'utf8') as string;

  it('themes the text editor and the sheet, not only the chrome', () => {
    expect(css).toMatch(/\.editor textarea\s*{[^}]*background:\s*var\(--panel\)/);
    expect(css).toMatch(/\.sheet\s*{[^}]*background:\s*var\(--paper\)/);
    const dark = /:root\[data-theme='dark'\]\s*{([^}]*)}/.exec(css)![1]!;
    for (const token of ['--bg', '--panel', '--ink', '--paper', '--paper-ink', '--chord-ink']) expect(dark).toContain(token);
  });

  it('keeps the system dark theme only when the user has not forced light', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme='light'\]\)/);
  });

  it('always prints on white paper with dark ink', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/:root:root:root[^}]*--paper:\s*#ffffff/);
    expect(print).toMatch(/--paper-ink:\s*#16181d/);
  });
});

describe('settings validation for the new options', () => {
  const ok = (patch: object) => parseSettings({ ...DEFAULT_SHEET_SETTINGS, ...patch });

  it('accepts valid values', () => {
    expect(ok({ chordColor: '#FFaa00', sectionGap: 0, headerText: 'x'.repeat(200), footerText: '' })).toBeDefined();
    expect(ok({ sectionGap: 3 })).toBeDefined();
  });

  it.each([
    ['chordColor', 'red'], ['chordColor', '#fff'], ['chordColor', '#gggggg'], ['chordColor', 'url(x)'], ['chordColor', 5],
    ['sectionGap', -0.1], ['sectionGap', 3.1], ['sectionGap', NaN], ['sectionGap', '1'],
    ['headerText', 'x'.repeat(201)], ['footerText', 5], ['headerText', null],
  ])('rejects %s = %p', (field, value) => {
    expect(ok({ [field]: value })).toBeUndefined();
  });

  it('gives older saves the defaults', () => {
    expect(parseSettings({ columns: 3 })).toMatchObject({ chordColor: 'auto', sectionGap: 2, headerText: '', footerText: '' });
  });
});

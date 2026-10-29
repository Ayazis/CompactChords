/** @jest-environment jsdom */
import { format, parseSheet } from '../../src/core';
import { DEFAULT_SETTINGS, renderSheet } from '../../src/ui/render';
import { exampleSheet, readProjectFile } from '../helpers';

function render(settings = DEFAULT_SETTINGS) {
  const root = document.createElement('article');
  renderSheet(root, format(parseSheet(exampleSheet), { showTabs: settings.showTabs }), { title: 'Example', details: 'Capo 2' }, settings);
  return root;
}

describe('end-to-end fixture render', () => {
  it('renders the heading and one section per block', () => {
    const root = render();
    expect(root.querySelector('.sheet-title')?.textContent).toBe('Example');
    expect(root.querySelector('.sheet-details')?.textContent).toBe('Capo 2');
    expect([...root.querySelectorAll('.block-title')].map((h) => h.textContent)).toEqual([
      'Intro', 'Verse 1', 'Chorus', 'Riff', 'Verse 2', 'Bridge', 'Outro',
    ]);
  });

  it('puts every chord of a pair above its lyric fragment', () => {
    const firstPair = render().querySelector('.pair')!;
    const segments = [...firstPair.querySelectorAll('.seg')].map((seg) => [
      seg.querySelector('.chord')!.textContent,
      seg.querySelector('.lyric')!.textContent,
    ]);
    expect(segments).toEqual([
      ['G', 'Paper lanterns on '],
      ['D', 'the river'],
    ]);
  });

  it('splits a section into paragraphs at its gap rows', () => {
    const verse = [...render().querySelectorAll('.block')].find((b) => b.querySelector('.block-title')?.textContent === 'Verse 2')!;
    expect([...verse.querySelectorAll('.paragraph')].map((p) => p.querySelectorAll('.row').length)).toEqual([2, 2]);
    expect(verse.querySelectorAll('.block > .row')).toHaveLength(0);
  });

  it('AC-02: chord and lyric sizes are independent', () => {
    const root = render({ ...DEFAULT_SETTINGS, chordPx: 15, lyricPx: 10 });
    expect(root.style.getPropertyValue('--chord-size')).toBe('15px');
    expect(root.style.getPropertyValue('--lyric-size')).toBe('10px');
  });

  it('omits tablature rows when tabs are hidden', () => {
    expect(render().querySelectorAll('.row.tab')).toHaveLength(6);
    expect(render({ ...DEFAULT_SETTINGS, showTabs: false }).querySelectorAll('.row.tab')).toHaveLength(0);
  });

  it('shows a hint on an empty sheet', () => {
    const root = document.createElement('article');
    renderSheet(root, [], { title: '', details: '' }, DEFAULT_SETTINGS);
    expect(root.querySelectorAll('.sheet-empty')).toHaveLength(1);
    expect(root.querySelectorAll('.block')).toHaveLength(0);
  });

  it('sets the column count', () => {
    expect(render({ ...DEFAULT_SETTINGS, columns: 3 }).style.getPropertyValue('--columns')).toBe('3');
  });
});

describe('print CSS (FR-05, AC-03, AC-04)', () => {
  const css = readProjectFile('src/ui/style.css');
  const printRules = css.slice(css.indexOf('@media print'));

  it('prints on A4 with margins of at most 15 mm', () => {
    const margin = /@page\s*{[^}]*size:\s*A4;[^}]*margin:\s*(\d+)mm/.exec(css);
    expect(Number(margin?.[1])).toBeLessThanOrEqual(15);
  });

  it('uses a 12 mm column gap', () => {
    expect(css).toMatch(/column-gap:\s*12mm/);
  });

  it('hides everything but the sheet when printing', () => {
    expect(printRules).toMatch(/\.topbar,\s*\.library,\s*\.settings,\s*\.editor,[^{]*{\s*display:\s*none/);
    expect(printRules).toMatch(/\.sheet\s*{[^}]*transform:\s*none/);
  });

  it('keeps paragraphs and rows together and headers with their content', () => {
    expect(css).toMatch(/\.paragraph\s*{[^}]*break-inside:\s*avoid/);
    expect(css).toMatch(/\.row\s*{[^}]*break-inside:\s*avoid/);
    expect(css).toMatch(/\.block-title\s*{[^}]*break-after:\s*avoid/);
  });

  it('balances the columns like the preview does', () => {
    expect(printRules).toMatch(/\.sheet\s*{[^}]*column-fill:\s*balance/);
    expect(css).not.toMatch(/column-fill:\s*auto/);
  });
});

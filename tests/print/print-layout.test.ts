// Prints the sheet to PDF in Chromium and compares it with the preview. jsdom
// does no layout, so only a real browser shows how columns fill a printed page.
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { parseSheet } from '../../src/core';
import { exampleSheet, realSheets } from '../helpers';
import { readPdf, type TextRun } from './pdf';

jest.setTimeout(60_000);

/** Width of an A4 page in CSS pixels. The sheet prints its own margins, so PDF text positions start at the page edge. */
const PAGE_WIDTH = (210 * 96) / 25.4;

let server: ChildProcess;
let origin: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  const vite = join(__dirname, '../../node_modules/vite/bin/vite.js');
  server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5391'], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, NO_COLOR: '1' },
  });
  origin = await new Promise<string>((resolve, reject) => {
    let output = '';
    server.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const url = /Local:\s+(http:\/\/\S+?)\/?\s/.exec(output)?.[1];
      if (url) resolve(url);
    });
    server.on('exit', (code) => reject(new Error(`vite exited with ${code}: ${output}`)));
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // Behave like the static site: no song lists or link import, so the app opens the example.
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(origin);
  await page.waitForSelector('#sheet .block');
});

afterEach(() => page.close());

async function openSheet(text: string, sizes?: { chordPx: number; lyricPx: number }): Promise<void> {
  const titles = parseSheet(text).blocks.map((block) => block.title ?? '');
  await page.evaluate(
    ({ text, sizes }) => {
      const set = (id: string, value: string) => {
        const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('input', text);
      if (sizes) {
        set('chord-size', String(sizes.chordPx));
        set('lyric-size', String(sizes.lyricPx));
      }
    },
    { text, sizes },
  );
  await page.waitForFunction(
    (titles) => [...document.querySelectorAll('#sheet-pages .block:not([data-split])')].map((block) => block.querySelector('.block-title')?.textContent ?? '').join('|') === titles.join('|'),
    titles,
  );
  // Sizes apply on the next frame; let layout settle before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function print(): Promise<TextRun[][]> {
  return readPdf(await page.pdf({ preferCSSPageSize: true }));
}

/** For each preview page and each of its two columns: the bottom of its lowest line, from the top of the page. */
async function previewColumnBottoms(): Promise<number[][]> {
  return page.evaluate((pageWidth) => {
    return [...document.querySelectorAll<HTMLElement>('#sheet-pages > .sheet')].map((sheet) => {
      const box = sheet.getBoundingClientRect();
      const scale = box.width / sheet.offsetWidth;
      const bottoms = [0, 0];
      for (const line of sheet.querySelectorAll('.row, .block-title')) {
        const rect = line.getBoundingClientRect();
        const column = (rect.left - box.left) / scale < pageWidth / 2 ? 0 : 1;
        bottoms[column] = Math.max(bottoms[column]!, (rect.bottom - box.top) / scale);
      }
      return bottoms;
    });
  }, PAGE_WIDTH);
}

const column = (run: TextRun) => (run.x < PAGE_WIDTH / 2 ? 0 : 1);
const lowest = (runs: TextRun[], index: number) => Math.max(0, ...runs.filter((run) => column(run) === index).map((run) => run.y));
const usesBothColumns = (runs: TextRun[]) => runs.some((run) => column(run) === 0) && runs.some((run) => column(run) === 1);

/** Expects every printed page to end its columns where the preview page does. Baselines sit a little above the bottom of their line box. */
async function expectPrintMatchesPreview(): Promise<void> {
  const preview = await previewColumnBottoms();
  const pages = await print();
  expect(pages).toHaveLength(preview.length);
  pages.forEach((runs, p) => {
    for (const index of [0, 1]) {
      const printed = lowest(runs, index);
      const expected = preview[p]![index]!;
      if (expected === 0) expect(printed).toBe(0);
      else {
        expect(printed).toBeGreaterThan(expected - 20);
        expect(printed).toBeLessThanOrEqual(expected);
      }
    }
  });
}

/** A song of `sections` sections, each with `paragraphs` paragraphs of two chord and lyric lines. */
function song(sections: number, paragraphs = 2): string {
  const paragraph = (n: number) => `G        D        Em\nLine ${n} of a verse that goes on\nC        G        D\nAnd another line ${n} to sing`;
  const section = (i: number) => Array.from({ length: paragraphs }, (_, p) => paragraph(i * paragraphs + p)).join('\n\n');
  return Array.from({ length: sections }, (_, i) => `[Verse ${i + 1}]\n${section(i)}\n`).join('\n');
}

describe('printed sheet (PDF from Chromium)', () => {
  it('prints a one-page song in the same two columns as the preview', async () => {
    await openSheet(exampleSheet);
    expect((await previewColumnBottoms())[0]![1]).toBeGreaterThan(0);
    await expectPrintMatchesPreview();
  });

  // A full page fills its first column to the bottom; print must not even the columns out.
  it.each([
    [10, 2],
    [14, 3],
    [3, 8],
  ])('prints %i sections of %i paragraphs with the column breaks of every preview page', async (sections, paragraphs) => {
    await openSheet(song(sections, paragraphs), { chordPx: 16, lyricPx: 16 });
    expect(await page.locator('#sheet-pages > .sheet').count()).toBeGreaterThan(1);
    await expectPrintMatchesPreview();
  });

  it.each(realSheets)('prints %s with the column breaks of the preview', async (_name, text) => {
    await openSheet(text);
    await expectPrintMatchesPreview();
  });

  // Not compared line for line with the preview: a line within a fraction of a
  // pixel of the column width can wrap on screen but not in print, which moves
  // the column break by a line (seen with the-hollies after fitting).
  it.each(realSheets)('prints %s on one page in both columns once fitted', async (_name, text) => {
    await openSheet(text);
    await page.click('#fit');
    await page.waitForTimeout(100);
    const pages = await print();

    expect(pages).toHaveLength(1);
    expect(usesBothColumns(pages[0]!)).toBe(true);
  });

  it.each(realSheets)('prints %s at the default size without empty pages', async (_name, text) => {
    await openSheet(text);
    const pages = await print();
    for (const runs of pages) expect(runs.length).toBeGreaterThan(0);
  });

  it('prints a song that fills one page without an empty page after it', async () => {
    await openSheet(song(9));
    expect(await page.textContent('#pages')).toBe('1 A4 page');
    const pages = await print();

    expect(pages).toHaveLength(1);
    expect(usesBothColumns(pages[0]!)).toBe(true);
  });

  // Sections taller than a column: Chromium balances the last page badly when a
  // whole section is kept together, leaving a page with one column used.
  it.each([
    [3, 8],
    [5, 5],
  ])('prints %i sections of %i paragraphs on pages that all use both columns', async (sections, paragraphs) => {
    await openSheet(song(sections, paragraphs), { chordPx: 20, lyricPx: 20 });
    const pages = await print();

    expect(pages.length).toBeGreaterThan(1);
    expect(pages).toHaveLength(await page.locator('#sheet-pages > .sheet').count());
    for (const runs of pages) expect(usesBothColumns(runs)).toBe(true);
  });
});

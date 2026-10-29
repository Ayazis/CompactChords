// Prints the sheet to PDF in Chromium and compares it with the preview. jsdom
// does no layout, so only a real browser shows how columns fill a printed page.
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { parseSheet } from '../../src/core';
import { exampleSheet } from '../helpers';
import { readPdf, type TextRun } from './pdf';

jest.setTimeout(60_000);

/** Printed area of an A4 page with 12 mm margins, in CSS pixels. */
const PRINT_WIDTH = (186 * 96) / 25.4;

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
    (titles) => [...document.querySelectorAll('#sheet .block')].map((block) => block.querySelector('.block-title')?.textContent ?? '').join('|') === titles.join('|'),
    titles,
  );
  // Sizes apply on the next frame; let layout settle before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function print(): Promise<TextRun[][]> {
  return readPdf(await page.pdf({ preferCSSPageSize: true }));
}

/** For each column of the preview: the bottom of its lowest line, from the top of the content. */
async function previewColumnBottoms(): Promise<number[]> {
  return page.evaluate((columnWidth) => {
    const sheet = document.getElementById('sheet')!;
    const scale = sheet.getBoundingClientRect().width / sheet.offsetWidth;
    const style = getComputedStyle(sheet);
    const box = sheet.getBoundingClientRect();
    const left = box.left + parseFloat(style.paddingLeft) * scale;
    const top = box.top + parseFloat(style.paddingTop) * scale;
    const bottoms = [0, 0];
    for (const line of sheet.querySelectorAll('.row, .block-title')) {
      const rect = line.getBoundingClientRect();
      const column = (rect.left - left) / scale < columnWidth ? 0 : 1;
      bottoms[column] = Math.max(bottoms[column]!, (rect.bottom - top) / scale);
    }
    return bottoms;
  }, PRINT_WIDTH / 2);
}

const column = (run: TextRun) => (run.x < PRINT_WIDTH / 2 ? 0 : 1);
const lowest = (runs: TextRun[], index: number) => Math.max(0, ...runs.filter((run) => column(run) === index).map((run) => run.y));
const usesBothColumns = (runs: TextRun[]) => runs.some((run) => column(run) === 0) && runs.some((run) => column(run) === 1);

/** A song of `sections` sections, each with `paragraphs` paragraphs of two chord and lyric lines. */
function song(sections: number, paragraphs = 2): string {
  const paragraph = (n: number) => `G        D        Em\nLine ${n} of a verse that goes on\nC        G        D\nAnd another line ${n} to sing`;
  const section = (i: number) => Array.from({ length: paragraphs }, (_, p) => paragraph(i * paragraphs + p)).join('\n\n');
  return Array.from({ length: sections }, (_, i) => `[Verse ${i + 1}]\n${section(i)}\n`).join('\n');
}

describe('printed sheet (PDF from Chromium)', () => {
  it('prints a one-page song in the same two columns as the preview', async () => {
    await openSheet(exampleSheet);
    const preview = await previewColumnBottoms();
    const pages = await print();

    expect(pages).toHaveLength(1);
    expect(preview[1]).toBeGreaterThan(0);
    // Text baselines sit a little above the bottom of their line box.
    for (const index of [0, 1]) {
      const printed = lowest(pages[0]!, index);
      expect(printed).toBeGreaterThan(preview[index]! - 20);
      expect(printed).toBeLessThanOrEqual(preview[index]!);
    }
  });

  it('prints a song that fills one page without an empty page after it', async () => {
    await openSheet(song(9));
    expect(await page.textContent('#pages')).toBe('About 1 A4 page');
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
    for (const runs of pages) expect(usesBothColumns(runs)).toBe(true);
  });
});

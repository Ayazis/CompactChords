// Records a demo video: open a chord page on the tab site, send it to
// CompactChords with the bookmarklet, tweak the sheet, save it and print it
// to PDF. Output goes to demo/ (git-ignored: it contains lyrics).
//
//   npx tsx scripts/demo.ts [tab-site chord page URL]
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright';
import { bookmarkletHref } from '../src/platform/bookmarklet';

const SONG_URL = process.argv[2] ?? 'https://tabs.ultimate-guitar.com/tab/guns-n-roses/sweet-child-o-mine-chords-176076';
const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'demo');
const SIZE = { width: 1440, height: 900 };

/** A visible cursor: headless video shows no pointer of its own. */
const CURSOR_SCRIPT = `
addEventListener('DOMContentLoaded', () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:2147483647;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,200,0,.45);border:2px solid rgba(30,30,30,.8);pointer-events:none;transition:transform .12s';
  document.documentElement.append(dot);
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.transform = 'scale(.6)'; }, true);
  addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
});`;

/** Stands in for the browser's bookmarks bar, which a recording does not show. */
const BOOKMARKS_BAR_SCRIPT = `
const bar = document.createElement('div');
bar.style.cssText = 'position:fixed;z-index:2147483646;left:0;right:0;top:0;height:34px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#f1f3f4;border-bottom:1px solid #c8c8c8;font:13px system-ui,sans-serif;color:#222';
bar.innerHTML = '<span style="color:#666">Bookmarks:</span><span id="cc-bookmark" style="padding:4px 10px;border-radius:12px;background:#fff;border:1px solid #c8c8c8;cursor:pointer">♫ Send to CompactChords</span>';
document.documentElement.append(bar);`;

let mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };

async function glide(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = Math.max(8, Math.round(Math.hypot(to.x - mouse.x, to.y - mouse.y) / 18));
  await page.mouse.move(to.x, to.y, { steps });
  mouse = to;
  await page.waitForTimeout(250);
}

async function click(page: Page, target: Locator, pause = 700): Promise<void> {
  await glide(page, target);
  await target.click();
  await page.waitForTimeout(pause);
}

async function startVite(): Promise<{ origin: string; stop: () => void }> {
  const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
  const server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5393'], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const origin = await new Promise<string>((resolve, reject) => {
    let output = '';
    server.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const url = /Local:\s+(http:\/\/\S+?)\/?\s/.exec(output)?.[1];
      if (url) resolve(url);
    });
    server.on('exit', (code) => reject(new Error(`vite exited with ${code}: ${output}`)));
  });
  return { origin, stop: () => server.kill() };
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    colorScheme: 'light',
  });
  await context.addInitScript(CURSOR_SCRIPT);
  // Behave like the static site: no song lists or link import.
  await context.route(`${vite.origin}/api/**`, (route) => route.fulfill({ status: 404, body: '' }));
  const page = await context.newPage();

  try {
    // 1. The chord page on the tab site.
    await page.goto(SONG_URL, { waitUntil: 'domcontentloaded' });
    // Decline the consent dialog, if the site shows one.
    const disagree = page.getByRole('button', { name: /^disagree$/i });
    if (await disagree.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await click(page, disagree, 200);
      await disagree.waitFor({ state: 'hidden' });
    }
    await page.evaluate(BOOKMARKS_BAR_SCRIPT);
    await page.waitForTimeout(1200);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(1500);

    // 2. Click the bookmarklet. A recording follows one tab, so let it open the app here.
    await click(page, page.locator('#cc-bookmark'), 200);
    const code = decodeURIComponent(bookmarkletHref(`${vite.origin}/`).slice('javascript:'.length));
    await page.evaluate(`window.open = () => null; ${code}`);
    await page.waitForURL(`${vite.origin}/**`);
    await page.waitForSelector('#sheet .block');
    await page.waitForTimeout(2500);

    // 3. Tweak the sheet.
    await click(page, page.locator('#transpose-up'));
    await click(page, page.locator('#transpose-up'), 1000);
    await click(page, page.locator('label:has(input[name="columns"][value="2"])'), 1200);

    const sections = page.locator('#sections .section-row');
    const choruses = sections.filter({ has: page.locator('.section-label', { hasText: /chorus/i }) });
    for (let i = 1; i < (await choruses.count()); i++) {
      await click(page, choruses.nth(i).locator('input[data-role="header"]'), 500);
    }
    const solo = sections.filter({ has: page.locator('.section-label', { hasText: /solo/i }) }).first();
    if (await solo.count()) await click(page, solo.locator('input[data-role="visible"]'), 800);

    await glide(page, page.locator('#chord-color'));
    await page.locator('#chord-color').fill('#c0392b');
    await page.waitForTimeout(900);

    await click(page, page.locator('#footer-text'), 200);
    await page.keyboard.type('Gig set · {date}', { delay: 60 });
    await page.waitForTimeout(600);

    await click(page, page.locator('#fit'), 1500);

    // 4. Save, then print.
    await click(page, page.locator('#save'), 1800);
    await glide(page, page.locator('#print'));
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(2500);
    const title = (await page.locator('#title').inputValue()) || 'sheet';
    const file = join(OUT, `${title.replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.waitForTimeout(1500);
    console.log(`PDF:   ${file}`);
  } finally {
    await context.close();
    await browser.close();
    vite.stop();
  }

  const video = readdirSync(OUT).find((name) => name.endsWith('.webm'));
  if (video) {
    renameSync(join(OUT, video), join(OUT, 'demo.webm'));
    console.log(`Video: ${join(OUT, 'demo.webm')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

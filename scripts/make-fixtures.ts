// Turns the pre-computed sheets in urls/cache into lyric-free test fixtures in
// tests/fixtures/sheets. Run `npm run precompute` first.
// Usage: npm run make-fixtures

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseLines } from '../src/core';
import type { CachedSheet } from '../server/saved-songs';
import { redactLyrics } from './redact';

const cache = join(process.cwd(), 'urls/cache');
const out = join(process.cwd(), 'tests/fixtures/sheets');
const files = (await readdir(cache).catch(() => [])).filter((file) => file.endsWith('.json')).sort();
if (files.length === 0) console.log('No sheets in urls/cache. Run npm run precompute first.');

for (const file of files) {
  const sheet = JSON.parse(await readFile(join(cache, file), 'utf8')) as CachedSheet;
  const redacted = redactLyrics(sheet.text);
  const kinds = (text: string) => parseLines(text).map((line) => line.kind).join();
  if (kinds(redacted) !== kinds(sheet.text)) throw new Error(`${file}: redacting changed how lines classify`);
  const name = `${basename(file, '.json').replace(/-chords-\d+$/, '')}.txt`;
  await writeFile(join(out, name), `${redacted.trimEnd()}\n`);
  console.log(`wrote tests/fixtures/sheets/${name}`);
}

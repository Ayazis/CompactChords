import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LineKind } from '../src/core';

const root = join(__dirname, '..');

export const exampleSheet = readFileSync(join(root, 'src/fixtures/example-01.txt'), 'utf8').trimEnd();

export const exampleLabels = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/example-01.labels.json'), 'utf8'),
) as LineKind[];

export const readProjectFile = (path: string) => readFileSync(join(root, path), 'utf8');

const sheetsDir = join(root, 'tests/fixtures/sheets');

/** Real-world sheets: public-domain songs and lyric-free copies of saved songs. */
export const realSheets: [name: string, text: string][] = readdirSync(sheetsDir)
  .filter((file) => file.endsWith('.txt'))
  .sort()
  .map((file) => [file.replace(/\.txt$/, ''), readFileSync(join(sheetsDir, file), 'utf8')]);

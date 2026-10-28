import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LineKind } from '../src/core';

const root = join(__dirname, '..');

export const exampleSheet = readFileSync(join(root, 'src/fixtures/example-01.txt'), 'utf8').trimEnd();

export const exampleLabels = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/example-01.labels.json'), 'utf8'),
) as LineKind[];

export const readProjectFile = (path: string) => readFileSync(join(root, path), 'utf8');

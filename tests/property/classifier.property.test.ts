import fc from 'fast-check';
import { parseLines } from '../../src/core';
import { normalizeLine } from '../../src/core/normalizer';
import { exampleSheet } from '../helpers';

const SEED = 20261028;
const lines = exampleSheet.split('\n');

describe('properties', () => {
  it('extra spaces and (x2) markers do not change line kinds', () => {
    const expected = parseLines(exampleSheet).map((line) => line.kind);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(lines.length - 1), fc.nat(40), fc.constantFrom(' ', '  ', ' (x2)')), {
          maxLength: 20,
        }),
        (edits) => {
          const noisy = [...lines];
          for (const [lineIndex, column, insert] of edits) {
            const line = noisy[lineIndex]!;
            // Only touch content lines, and only at word boundaries, so words stay intact.
            const kind = expected[lineIndex];
            if (kind !== 'Chord' && kind !== 'Lyric') continue;
            if (insert.includes('x2') && kind !== 'Chord') continue;
            const at = Math.min(column, line.length);
            if (at < line.length && line[at] !== ' ') continue;
            noisy[lineIndex] = line.slice(0, at) + insert + line.slice(at);
          }
          expect(parseLines(noisy.join('\n')).map((line) => line.kind)).toEqual(expected);
        },
      ),
      { seed: SEED, numRuns: 200 },
    );
  });

  it('normalization is idempotent', () => {
    const alphabet = fc.constantFrom('A', 'b', '#', '♯', '♭', ' ', '\t', ' ', 'm', '7', '/', 'é', 'é');
    fc.assert(
      fc.property(fc.array(alphabet, { maxLength: 30 }).map((chars) => chars.join('')), (text) => {
        const once = normalizeLine(text);
        expect(normalizeLine(once)).toBe(once);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });
});

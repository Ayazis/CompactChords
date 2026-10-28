import { parseLines, DEFAULT_CONFIG, type LineKind } from '../../src/core';
import { chordScore, classifyLine } from '../../src/core/classifier';
import { tokenize } from '../../src/core/tokenizer';
import { exampleLabels, exampleSheet } from '../helpers';

const classify = (line: string) => classifyLine(line, tokenize(line), DEFAULT_CONFIG);

describe('classifyLine', () => {
  it.each<[string, LineKind]>([
    ['', 'Blank'],
    ['   ', 'Blank'],
    ['[Verse]', 'Header'],
    ['e|---0---|', 'Tab'],
    ['G   D   Em   C', 'Chord'],
    ['Intro: G D Em C', 'Chord'],
    ['| G | % | C | % |', 'Chord'],
    ['N.C.', 'Chord'],
    ['Em  D  C  (hold)', 'Chord'],
    ['Db (Db Ab Ab Db)  Db (Db Ab Ab Db)  repeat the riff', 'Chord'],
    ['Em   G   A   twice   Em', 'Chord'],
    ['A little closer to the morning', 'Lyric'],
    ['Am I dreaming of the harbour light', 'Lyric'],
    ['Hold the line, hold the line', 'Lyric'],
    ['(x2)', 'Lyric'],
  ])('%j is %s', (line, kind) => expect(classify(line).kind).toBe(kind));

  it('reports confidence between 0 and 1', () => {
    for (const line of ['G D', 'A day in the life', 'A B words']) {
      const { confidence } = classify(line);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });

  it('honours a custom threshold', () => {
    // 4 chords out of 5 tokens, no long words: score 0.8.
    const line = 'G D C Em la';
    expect(classifyLine(line, tokenize(line), DEFAULT_CONFIG).kind).toBe('Chord');
    expect(classifyLine(line, tokenize(line), { ...DEFAULT_CONFIG, chordThreshold: 0.9 }).kind).toBe('Lyric');
  });

  it('has no score for lines made only of neutral tokens', () => {
    expect(chordScore(tokenize('| % |'), DEFAULT_CONFIG)).toBeUndefined();
  });
});

describe('AC-01: fixture precision and recall', () => {
  const kinds = parseLines(exampleSheet).map((line) => line.kind);

  it('has one label per line', () => {
    expect(kinds).toHaveLength(exampleLabels.length);
  });

  it('detects chord lines with at least 90% precision and recall', () => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    kinds.forEach((kind, i) => {
      const expected = exampleLabels[i];
      if (kind === 'Chord' && expected === 'Chord') truePositive++;
      else if (kind === 'Chord') falsePositive++;
      else if (expected === 'Chord') falseNegative++;
    });
    expect(truePositive / (truePositive + falsePositive)).toBeGreaterThanOrEqual(0.9);
    expect(truePositive / (truePositive + falseNegative)).toBeGreaterThanOrEqual(0.9);
  });

  it('matches every label in the fixture', () => {
    expect(kinds).toEqual(exampleLabels);
  });
});

describe('NFR-05: performance', () => {
  it('classifies 1000 lines in under 150 ms', () => {
    const big = Array.from({ length: 20 }, () => exampleSheet).join('\n');
    expect(big.split('\n').length).toBeGreaterThanOrEqual(1000);
    const started = performance.now();
    parseLines(big);
    expect(performance.now() - started).toBeLessThan(150);
  });
});

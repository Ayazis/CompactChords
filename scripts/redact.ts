// Replaces the lyrics of a chord sheet with filler of the same shape, so real
// sheets can be kept as test fixtures without publishing their words.

import { isChordToken, isNeutralToken } from '../src/core/chord-grammar';
import { parseLines } from '../src/core';

// No letters A–G (a word could read as a chord) and no x (repeat markers).
const FILLER = 'lorumipsntv';

function fill(word: string): string {
  let i = 0;
  return word.replace(/\p{L}/gu, (letter) => {
    const next = FILLER[i++ % FILLER.length]!;
    return letter === letter.toLowerCase() ? next : next.toUpperCase();
  });
}

/**
 * Keeps headers, tablature, chords and repeat markers; every other word keeps
 * its length, case and punctuation but loses its letters. Chord columns stay
 * in place, so the sheet classifies, segments and lays out the same.
 */
export function redactLyrics(text: string): string {
  return parseLines(text)
    .map((line) => {
      if (line.kind === 'Header' || line.kind === 'Tab') return line.raw;
      return line.raw.replace(/\S+/g, (token) => (isChordToken(token) || isNeutralToken(token) ? token : fill(token)));
    })
    .join('\n');
}

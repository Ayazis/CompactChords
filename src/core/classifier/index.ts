import { headerTitle, isChordToken, isNeutralToken, isTabStaff } from '../chord-grammar';
import type { CoreConfig, LineKind, Token } from '../types';

export interface Classification {
  kind: LineKind;
  confidence: number;
}

const LONG_WORD = /^[\p{L}']{4,}/u;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Scores a line as the share of chord tokens among the tokens that carry a
 * signal, where every long word that is not a chord cancels out chords. The
 * penalty scales with line length, so a long chord line with a trailing
 * "(repeat riff)" still counts as chords.
 */
export function chordScore(tokens: Token[], config: CoreConfig): number | undefined {
  const considered = tokens.filter((token) => !isNeutralToken(token.text));
  if (considered.length === 0) return undefined;

  const chords = considered.filter((token) => isChordToken(token.text)).length;
  const longWords = considered.filter(
    (token) => !isChordToken(token.text) && LONG_WORD.test(token.text),
  ).length;
  return (chords - config.longWordPenalty * longWords) / considered.length;
}

export function classifyLine(raw: string, tokens: Token[], config: CoreConfig): Classification {
  if (raw.trim() === '') return { kind: 'Blank', confidence: 1 };
  if (headerTitle(raw) !== undefined) return { kind: 'Header', confidence: 1 };
  if (isTabStaff(raw)) return { kind: 'Tab', confidence: 1 };

  const score = chordScore(tokens, config);
  if (score === undefined) {
    // Only neutral tokens: bar lines or "N.C." belong to the chords, a stray
    // "(x2)" reads best with the lyrics.
    return /\||N\.?C\.?/.test(raw) ? { kind: 'Chord', confidence: 0.5 } : { kind: 'Lyric', confidence: 0.5 };
  }
  return score >= config.chordThreshold
    ? { kind: 'Chord', confidence: clamp(score) }
    : { kind: 'Lyric', confidence: clamp(1 - score) };
}

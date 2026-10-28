import type { Token } from '../types';

/** Splits a normalized line on whitespace, remembering each token's column. */
export function tokenize(line: string): Token[] {
  return [...line.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index }));
}

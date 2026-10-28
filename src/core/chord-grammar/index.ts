// Single source of truth for what counts as a chord token.

const ROOT = '[A-G](?:#|b)?';
const QUALITY = '(?:maj|min|m|M|dim|aug|sus|add|\\+|°|ø|-)?';
const EXTENSION = '(?:6\\/9|\\d{1,2})?';
const ALTERATIONS = '(?:(?:maj|sus|add|no|b|#|\\+|-)\\d{1,2}|sus)*';
const PARENTHESISED = '(?:\\((?:(?:maj|sus|add|no|b|#)?\\d{1,2},?)+\\))?';
const BASS = `(?:\\/${ROOT})?`;

export const CHORD_PATTERN = new RegExp(
  `^${ROOT}${QUALITY}${EXTENSION}${ALTERATIONS}${PARENTHESISED}${BASS}$`,
);

/**
 * Tokens that may appear on chord lines but say nothing either way:
 * bar lines, repeat markers, "N.C.", and section labels such as "Intro:".
 */
const NEUTRAL_PATTERN =
  /^(?:\(?[x×]\d+\)?|\(?\d+[x×]\)?|N\.?C\.?|[|:/%*.\-–()]+|(?:intro|verse|chorus|bridge|outro|solo|interlude|instrumental|pre-chorus|refrain|coda|ending|riff)\s*\d*:)$/i;

const count = (text: string, char: string) => text.split(char).length - 1;

/** Strips unbalanced brackets around a chord, e.g. "(G" or "C)", but keeps "A7(b9)". */
function unwrap(token: string): string {
  let text = token.replace(/^\(+(?=[A-G])/, '');
  while (text.endsWith(')') && count(text, ')') > count(text, '(')) text = text.slice(0, -1);
  return text;
}

export function isChordToken(token: string): boolean {
  return CHORD_PATTERN.test(unwrap(token));
}

export interface ChordParts {
  /** Brackets before the chord, e.g. "(" in "(G". */
  lead: string;
  root: string;
  /** Everything between root and bass, e.g. "m7b5" or "(maj7)". */
  quality: string;
  bass?: string;
  /** Unbalanced brackets after the chord, e.g. ")" in "C)". */
  trail: string;
}

export function parseChord(token: string): ChordParts | undefined {
  if (!isChordToken(token)) return undefined;
  const lead = /^\(*(?=[A-G])/.exec(token)?.[0] ?? '';
  const chord = unwrap(token);
  const trail = token.slice(lead.length + chord.length);
  const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(chord)!;
  const parts: ChordParts = { lead, root: match[1]!, quality: match[2]!, trail };
  if (match[3]) parts.bass = match[3];
  return parts;
}

export function isNeutralToken(token: string): boolean {
  return NEUTRAL_PATTERN.test(token);
}

const SECTION_WORDS =
  'intro|verse|chorus|bridge|outro|solo|interlude|instrumental|pre-chorus|prechorus|refrain|coda|ending|riff|hook|break';

const BRACKET_HEADER = /^\s*\[([^\]]+)\]\s*$/;
const WORD_HEADER = new RegExp(
  `^\\s*((?:${SECTION_WORDS})(?:\\s*\\d+)?(?:\\s*\\(?[x×]\\d+\\)?)?)\\s*:?\\s*$`,
  'i',
);

/** Returns the section title when the line is a header such as "[Chorus]" or "Verse 2:". */
export function headerTitle(line: string): string | undefined {
  const match = BRACKET_HEADER.exec(line) ?? WORD_HEADER.exec(line);
  return match?.[1]?.trim();
}

// A string name and bar, then a run of tab notation. Anything after that run
// (a second staff, "(x3)", "--> TO VERSE") is allowed.
const TAB_STAFF = /^\s*(?:[A-Ga-g][#b]?\s?)?\|([-\d|/\\~^()*.<>=hpbrxXsSvVtT]*)/;

/** True for a guitar tablature staff line such as "e|--0--2--|". */
export function isTabStaff(line: string): boolean {
  const staff = TAB_STAFF.exec(line)?.[1];
  return staff !== undefined && count(staff, '-') >= 3;
}

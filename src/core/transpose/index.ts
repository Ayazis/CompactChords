// Transposition and key detection. Works on chord lines only; lyrics are never touched.

import { parseChord, type ChordParts } from '../chord-grammar';
import type { Line, SheetDocument } from '../types';

export type Accidentals = 'auto' | 'sharp' | 'flat';

export interface Key {
  /** Pitch class, C = 0. */
  root: number;
  minor: boolean;
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Major keys written with flats: F, Bb, Eb, Ab, Db. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1]);

const mod12 = (value: number) => ((value % 12) + 12) % 12;

export function noteIndex(note: string): number {
  const shift = note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0;
  return mod12(NATURALS[note[0]!]! + shift);
}

export function noteName(index: number, flats: boolean): string {
  return (flats ? FLATS : SHARPS)[mod12(index)]!;
}

export function transposeChord(token: string, semitones: number, flats: boolean): string {
  const parts = parseChord(token);
  if (!parts) return token;
  const move = (note: string) => noteName(noteIndex(note) + semitones, flats);
  return `${parts.lead}${move(parts.root)}${parts.quality}${parts.bass ? `/${move(parts.bass)}` : ''}${parts.trail}`;
}

/**
 * Transposes a chord line, keeping every chord at its original column where
 * possible; a chord that grows only pushes the next one when they would touch.
 */
export function transposeLine(line: Line, semitones: number, flats: boolean): Line {
  let raw = '';
  const tokens = line.tokens.map((token) => {
    const text = transposeChord(token.text, semitones, flats);
    const start = raw.length === 0 ? token.start : Math.max(token.start, raw.length + 1);
    raw = raw.padEnd(start) + text;
    return { text, start };
  });
  return { ...line, raw, tokens };
}

export function transposeDocument(doc: SheetDocument, semitones: number, flats: boolean): SheetDocument {
  return {
    blocks: doc.blocks.map((block) => ({
      ...block,
      lines: block.lines.map((line) => (line.kind === 'Chord' ? transposeLine(line, semitones, flats) : line)),
    })),
  };
}

const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/**
 * Rewrites a chord as a Nashville number relative to a key. Minor keys count
 * from their relative major, so Am in A minor is 6m.
 */
export function nashvilleChord(token: string, key: Key): string {
  const parts = parseChord(token);
  if (!parts) return token;
  const tonic = key.minor ? mod12(key.root + 3) : key.root;
  const degree = (note: string) => DEGREES[mod12(noteIndex(note) - tonic)]!;
  return `${parts.lead}${degree(parts.root)}${parts.quality}${parts.bass ? `/${degree(parts.bass)}` : ''}${parts.trail}`;
}

/** Replaces every chord with its Nashville number, re-spacing like transposeLine. */
export function nashvilleDocument(doc: SheetDocument, key: Key): SheetDocument {
  return {
    blocks: doc.blocks.map((block) => ({
      ...block,
      lines: block.lines.map((line) => {
        if (line.kind !== 'Chord') return line;
        let raw = '';
        const tokens = line.tokens.map((token) => {
          const text = nashvilleChord(token.text, key);
          const start = raw.length === 0 ? token.start : Math.max(token.start, raw.length + 1);
          raw = raw.padEnd(start) + text;
          return { text, start };
        });
        return { ...line, raw, tokens };
      }),
    })),
  };
}

type Triad = 'maj' | 'min' | 'dim';

function triadOf(chord: ChordParts): Triad {
  if (/^(dim|°|ø|m7b5)/.test(chord.quality)) return 'dim';
  return /^(m(?!aj)|min|-)/.test(chord.quality) ? 'min' : 'maj';
}

export function chordsOf(doc: SheetDocument): ChordParts[] {
  return doc.blocks
    .flatMap((block) => block.lines)
    .filter((line) => line.kind === 'Chord')
    .flatMap((line) => line.tokens)
    .map((token) => parseChord(token.text))
    .filter((chord): chord is ChordParts => chord !== undefined);
}

// Krumhansl-Kessler key profiles: how strongly each pitch class, counted from
// the tonic, suggests a major or minor key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Notes a chord contributes: root, third, fifth and, when written, a seventh. */
function chordTones(chord: ChordParts): [number, number][] {
  const root = noteIndex(chord.root);
  const triad = triadOf(chord);
  const third = triad === 'maj' ? 4 : 3;
  const fifth = triad === 'dim' ? 6 : /^(aug|\+)/.test(chord.quality) ? 8 : 7;
  const tones: [number, number][] = [
    [root, 1.5],
    [mod12(root + third), 1],
    [mod12(root + fifth), 1],
  ];
  if (/maj(7|9|11|13)|M7/.test(chord.quality)) tones.push([mod12(root + 11), 0.5]);
  else if (/(7|9|11|13)/.test(chord.quality)) tones.push([mod12(root + 10), 0.5]);
  return tones;
}

function correlation(a: number[], b: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanA = mean(a);
  const meanB = mean(b);
  let both = 0;
  let varA = 0;
  let varB = 0;
  a.forEach((value, i) => {
    both += (value - meanA) * (b[i]! - meanB);
    varA += (value - meanA) ** 2;
    varB += (b[i]! - meanB) ** 2;
  });
  return varA === 0 || varB === 0 ? 0 : both / Math.sqrt(varA * varB);
}

/**
 * Picks the key whose Krumhansl-Kessler profile best correlates with the
 * pitch classes of all chord tones, counting the first and last chord's root
 * extra since songs tend to start and end on the tonic.
 */
export function detectKey(doc: SheetDocument): Key | undefined {
  const chords = chordsOf(doc);
  const first = chords[0];
  const last = chords[chords.length - 1];
  if (!first || !last) return undefined;

  const histogram = new Array<number>(12).fill(0);
  for (const chord of chords) for (const [note, weight] of chordTones(chord)) histogram[note]! += weight;
  histogram[noteIndex(first.root)]! += 3;
  histogram[noteIndex(last.root)]! += 2;

  let best: Key | undefined;
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    const rotated = histogram.map((_, i) => histogram[mod12(root + i)]!);
    for (const minor of [false, true]) {
      const score = correlation(rotated, minor ? MINOR_PROFILE : MAJOR_PROFILE);
      if (score > bestScore) {
        best = { root, minor };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Parses a key name such as "G" or "F#m"; undefined for anything else. */
export function parseKey(name: string): Key | undefined {
  const match = /^([A-G][#b]?)(m?)$/.exec(name);
  return match ? { root: noteIndex(match[1]!), minor: match[2] === 'm' } : undefined;
}

export function shiftKey(key: Key, semitones: number): Key {
  return { root: mod12(key.root + semitones), minor: key.minor };
}

/** Whether chords in this key read best with flats (F, Bb, Dm, Gm, …). */
export function keyUsesFlats(key: Key): boolean {
  return FLAT_MAJOR_KEYS.has(key.minor ? mod12(key.root + 3) : key.root);
}

export function prefersFlats(key: Key | undefined, accidentals: Accidentals): boolean {
  if (accidentals !== 'auto') return accidentals === 'flat';
  return key !== undefined && keyUsesFlats(key);
}

export function keyName(key: Key, flats: boolean): string {
  return `${noteName(key.root, flats)}${key.minor ? 'm' : ''}`;
}

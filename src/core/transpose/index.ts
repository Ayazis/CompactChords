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

/**
 * Picks the key whose scale fits the most chords, with a bonus when the song
 * starts or ends on the key's tonic chord.
 */
export function detectKey(doc: SheetDocument): Key | undefined {
  const chords = chordsOf(doc).map((chord) => ({ root: noteIndex(chord.root), triad: triadOf(chord) }));
  const first = chords[0];
  const last = chords[chords.length - 1];
  if (!first || !last) return undefined;

  let best: Key | undefined;
  let bestScore = -1;
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const major = minor ? mod12(root + 3) : root;
      const scale = new Map<number, Triad>([
        [major, 'maj'],
        [mod12(major + 2), 'min'],
        [mod12(major + 4), 'min'],
        [mod12(major + 5), 'maj'],
        [mod12(major + 7), 'maj'],
        [mod12(major + 9), 'min'],
        [mod12(major + 11), 'dim'],
      ]);
      const fits = (chord: { root: number; triad: Triad }) =>
        scale.get(chord.root) === chord.triad || (minor && chord.root === mod12(root + 7) && chord.triad === 'maj');
      const isTonic = (chord: { root: number; triad: Triad }) =>
        chord.root === root && chord.triad === (minor ? 'min' : 'maj');

      const score = chords.filter(fits).length + (isTonic(first) ? 3 : 0) + (isTonic(last) ? 2 : 0);
      if (score > bestScore) {
        best = { root, minor };
        bestScore = score;
      }
    }
  }
  return best;
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

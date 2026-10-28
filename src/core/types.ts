// Data contracts shared by all core modules. See docs/Architecture.md.

export type LineKind = 'Chord' | 'Lyric' | 'Blank' | 'Header' | 'Tab';

export interface Token {
  text: string;
  /** Column of the first character in the normalized line. */
  start: number;
}

export interface Line {
  id: string;
  raw: string;
  tokens: Token[];
  kind: LineKind;
  confidence: number;
}

export interface Block {
  id: string;
  title?: string;
  lines: Line[];
  meta: { showChords: boolean; visible: boolean };
}

export interface SheetDocument {
  blocks: Block[];
}

export interface CoreConfig {
  /** Minimum score for a line to count as a chord line. */
  chordThreshold: number;
  /** How many chords each non-chord word of 4+ letters cancels out. */
  longWordPenalty: number;
}

export const DEFAULT_CONFIG: CoreConfig = {
  chordThreshold: 0.6,
  longWordPenalty: 1,
};

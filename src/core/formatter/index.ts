import type { Line, SheetDocument } from '../types';

/** A piece of lyric with the chord that sits above its first character. */
export interface Segment {
  chord?: string;
  text: string;
}

export type Row =
  | { type: 'pair'; segments: Segment[] }
  | { type: 'chords'; text: string }
  | { type: 'lyric'; text: string }
  | { type: 'tab'; text: string }
  /** Paragraph break inside a section. */
  | { type: 'gap' };

export interface RenderBlock {
  id: string;
  title?: string;
  /** True when the block directly continues the previous one without a header. */
  continuation: boolean;
  rows: Row[];
}

export interface FormatOptions {
  showTabs: boolean;
}

/**
 * Splits a lyric at the columns of the chords above it, so chords stay attached
 * to the right syllable whatever font sizes are used for each.
 */
export function pairSegments(chordLine: Line, lyric: string): Segment[] {
  const chords = chordLine.tokens;
  const segments: Segment[] = [];
  const first = chords[0];
  if (!first) return [{ text: lyric }];

  if (first.start > 0) segments.push({ text: lyric.slice(0, first.start).padEnd(first.start) });
  chords.forEach((chord, i) => {
    const next = chords[i + 1];
    const text = next
      ? lyric.slice(chord.start, next.start).padEnd(next.start - chord.start)
      : lyric.slice(chord.start);
    segments.push({ chord: chord.text, text });
  });
  return segments;
}

function linesToRows(lines: Line[], showChords: boolean, options: FormatOptions): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    switch (line.kind) {
      case 'Chord':
        if (next?.kind === 'Lyric') {
          rows.push(showChords ? { type: 'pair', segments: pairSegments(line, next.raw) } : { type: 'lyric', text: next.raw });
          i++;
        } else if (showChords) {
          rows.push({ type: 'chords', text: line.raw });
        }
        break;
      case 'Tab':
        if (options.showTabs) rows.push({ type: 'tab', text: line.raw });
        break;
      case 'Blank':
        // Only between visible rows: hidden chords or tabs leave no double gap.
        if (rows.length > 0 && rows[rows.length - 1]!.type !== 'gap') rows.push({ type: 'gap' });
        break;
      default:
        rows.push({ type: 'lyric', text: line.raw });
    }
  }
  if (rows[rows.length - 1]?.type === 'gap') rows.pop();
  return rows;
}

export function format(doc: SheetDocument, options: FormatOptions): RenderBlock[] {
  const out: RenderBlock[] = [];
  for (const block of doc.blocks) {
    if (!block.meta.visible) continue;
    const rows = linesToRows(block.lines, block.meta.showChords, options);
    // A titled block with nothing left to show is kept as a bare header (a repeat
    // marker like "[Chorus]"), unless it only held tablature that is hidden.
    const onlyHiddenTabs = !options.showTabs && block.lines.some((line) => line.kind === 'Tab');
    if (rows.length === 0 && (block.title === undefined || onlyHiddenTabs)) continue;
    const rendered: RenderBlock = { id: block.id, continuation: block.title === undefined && out.length > 0, rows };
    if (block.title !== undefined) rendered.title = block.title;
    out.push(rendered);
  }
  return out;
}

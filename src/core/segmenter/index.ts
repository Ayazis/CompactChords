import { headerTitle } from '../chord-grammar';
import type { Block, Line } from '../types';

/**
 * Groups lines into blocks. A header opens a new titled block. A blank line
 * ends a paragraph: in a titled block the next paragraph stays in the same
 * block (kept apart by one Blank line), as the header names the whole
 * section; an untitled block closes instead. Header lines are not kept.
 *
 * Ids count paragraphs rather than blocks, so a section keeps the id it had
 * when every paragraph was a block of its own (saved settings refer to it).
 */
export function segment(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  let paragraphs = 0;
  let pendingBlank: Line | undefined;

  const open = (title?: string): Block => {
    const block: Block = { id: `B${paragraphs++}`, lines: [], meta: { showChords: true, visible: true } };
    if (title !== undefined) block.title = title;
    blocks.push(block);
    return block;
  };

  for (const line of lines) {
    if (line.kind === 'Header') {
      current = open(headerTitle(line.raw));
      pendingBlank = undefined;
    } else if (line.kind === 'Blank') {
      if (!current || current.lines.length === 0) continue;
      if (current.title === undefined) current = undefined;
      else pendingBlank = line;
    } else {
      if (current && pendingBlank) {
        current.lines.push(pendingBlank);
        paragraphs++;
      }
      pendingBlank = undefined;
      current ??= open();
      current.lines.push(line);
    }
  }
  return blocks;
}

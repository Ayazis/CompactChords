import { headerTitle } from '../chord-grammar';
import type { Block, Line } from '../types';

/**
 * Groups lines into blocks. A header opens a new titled block; a blank line
 * closes the current block once it has content. Blank and header lines are
 * not kept inside blocks.
 */
export function segment(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;

  const open = (title?: string): Block => {
    const block: Block = { id: `B${blocks.length}`, lines: [], meta: { showChords: true, visible: true } };
    if (title !== undefined) block.title = title;
    blocks.push(block);
    return block;
  };

  for (const line of lines) {
    if (line.kind === 'Header') {
      current = open(headerTitle(line.raw));
    } else if (line.kind === 'Blank') {
      if (current && current.lines.length > 0) current = undefined;
    } else {
      current ??= open();
      current.lines.push(line);
    }
  }
  return blocks;
}

// Text clean-up applied before tokenizing. Column positions matter for chord
// alignment, so leading whitespace and inner spacing are preserved.

const TAB_WIDTH = 4;

/** Removes Ultimate Guitar markup ([ch]G[/ch], [tab]…[/tab]) keeping the inner text. */
export function stripMarkup(text: string): string {
  return text.replace(/\[\/?(?:ch|tab)\]/g, '');
}

function expandTabs(line: string): string {
  let out = '';
  for (const char of line) {
    out += char === '\t' ? ' '.repeat(TAB_WIDTH - (out.length % TAB_WIDTH)) : char;
  }
  return out;
}

export function normalizeLine(line: string): string {
  return expandTabs(
    stripMarkup(line)
      .normalize('NFC')
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .replace(/[   ]/g, ' ')
      .replace(/\r/g, ''),
  ).trimEnd();
}

export function normalizeText(text: string): string[] {
  return stripMarkup(text).replace(/\r\n?/g, '\n').split('\n').map(normalizeLine);
}

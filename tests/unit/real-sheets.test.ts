import { format, parseLines, parseSheet } from '../../src/core';
import { redactLyrics } from '../../scripts/redact';
import { realSheets } from '../helpers';

describe.each(realSheets)('real sheet %s', (_name, text) => {
  const doc = parseSheet(text);

  it('parses into the same sections and line kinds', () => {
    expect(doc.blocks.map((block) => [block.id, block.title ?? null, block.lines.map((line) => line.kind).join(' ')])).toMatchSnapshot();
  });

  it('keeps every line that is not blank or a header, in order', () => {
    const content = parseLines(text).filter((line) => line.kind !== 'Blank' && line.kind !== 'Header');
    const kept = doc.blocks.flatMap((block) => block.lines.filter((line) => line.kind !== 'Blank'));
    expect(kept.map((line) => line.id)).toEqual(content.map((line) => line.id));
  });

  it('formats without empty paragraphs', () => {
    for (const block of format(doc, { showTabs: true })) {
      const types = block.rows.map((row) => row.type);
      expect(types[0]).not.toBe('gap');
      expect(types.at(-1)).not.toBe('gap');
      expect(types.join(' ')).not.toMatch(/gap gap/);
    }
  });
});

describe('redactLyrics', () => {
  const sheet = realSheets.find(([name]) => name.startsWith('public-domain__scarborough'))![1];

  it('keeps how every line classifies', () => {
    const kinds = (text: string) => parseLines(text).map((line) => line.kind);
    for (const [, text] of realSheets) expect(kinds(redactLyrics(text))).toEqual(kinds(text));
  });

  it('removes the words but keeps chords, headers, tabs and the shape of each line', () => {
    const redacted = redactLyrics(sheet);
    expect(redacted).not.toMatch(/Parsley|rosemary|Scarborough/);
    expect(redacted).toContain('[Verse 1]');
    expect(redacted).toContain('C          Am     C   D       Am');
    expect(redacted).toContain('N.C.');
    expect(redacted.split('\n').map((line) => line.length)).toEqual(sheet.split('\n').map((line) => line.length));
    expect(redactLyrics('Am     G\nAre you going, Sir?')).toBe('Am     G\nLor lor lorum, Lor?');
  });

  it('keeps tablature as it is', () => {
    expect(redactLyrics('e|--0--2--| slide up')).toBe('e|--0--2--| slide up');
  });
});

import { format, parseLines, parseSheet } from '../../src/core';
import { pairSegments } from '../../src/core/formatter';
import { segment } from '../../src/core/segmenter';
import { exampleSheet } from '../helpers';

describe('segment', () => {
  it('opens titled blocks at headers and keeps paragraphs after a blank line in them', () => {
    const blocks = segment(parseLines('[Verse]\n\nG\nWords here\n\n\nMore words\n\n[Chorus]\nC\n'));
    expect(blocks.map((b) => [b.title, b.lines.map((l) => l.kind)])).toEqual([
      ['Verse', ['Chord', 'Lyric', 'Blank', 'Lyric']],
      ['Chorus', ['Chord']],
    ]);
  });

  it('splits untitled paragraphs at blank lines', () => {
    const blocks = segment(parseLines('G\nWords here\n\nMore words\n[Chorus]\nC'));
    expect(blocks.map((b) => [b.title, b.lines.map((l) => l.raw)])).toEqual([
      [undefined, ['G', 'Words here']],
      [undefined, ['More words']],
      ['Chorus', ['C']],
    ]);
  });

  it('numbers blocks by paragraph so section ids survive merged paragraphs', () => {
    const blocks = segment(parseLines('[Verse]\nla\n\nla\n\nla\n[Chorus]\nC'));
    expect(blocks.map((b) => [b.title, b.id])).toEqual([
      ['Verse', 'B0'],
      ['Chorus', 'B3'],
    ]);
  });

  it('keeps a header with no content as an empty titled block', () => {
    const blocks = segment(parseLines('[Intro]\n[Verse]\nla la'));
    expect(blocks.map((b) => [b.title, b.lines.length])).toEqual([
      ['Intro', 0],
      ['Verse', 1],
    ]);
  });

  it('gives blocks deterministic ids, visible with chords', () => {
    const blocks = segment(parseLines('G\n\nC'));
    expect(blocks.map((b) => [b.id, b.meta])).toEqual([
      ['B0', { showChords: true, visible: true }],
      ['B1', { showChords: true, visible: true }],
    ]);
  });
});

describe('pairSegments', () => {
  const chordLine = (text: string) => parseLines(text)[0]!;

  it('splits the lyric at chord columns', () => {
    expect(pairSegments(chordLine('G       D'), 'Paper lanterns')).toEqual([
      { chord: 'G', text: 'Paper la' },
      { chord: 'D', text: 'nterns' },
    ]);
  });

  it('keeps lyric text before the first chord', () => {
    expect(pairSegments(chordLine('    C'), 'And we')).toEqual([
      { text: 'And ' },
      { chord: 'C', text: 'we' },
    ]);
  });

  it('pads with spaces when chords run past the lyric', () => {
    expect(pairSegments(chordLine('G   D    C'), 'Hi')).toEqual([
      { chord: 'G', text: 'Hi  ' },
      { chord: 'D', text: '     ' },
      { chord: 'C', text: '' },
    ]);
  });

  it('returns the lyric unchanged when there are no chords', () => {
    expect(pairSegments(chordLine(''), 'Just words')).toEqual([{ text: 'Just words' }]);
  });
});

describe('format', () => {
  const doc = parseSheet(exampleSheet);

  it('pairs chords with the lyric below and keeps lone chord lines', () => {
    const blocks = format(doc, { showTabs: true });
    const verse = blocks.find((b) => b.title === 'Verse 1')!;
    expect(verse.rows.map((r) => r.type)).toEqual(['pair', 'pair', 'pair', 'pair']);
    const intro = blocks.find((b) => b.title === 'Intro')!;
    expect(intro.rows).toEqual([{ type: 'chords', text: 'G  D  Em  C   (x2)' }]);
  });

  it('marks untitled blocks after another block as continuations', () => {
    const blocks = format(parseSheet('G\nla\n\nla\n[Verse]\nla'), { showTabs: true });
    expect(blocks.map((b) => [b.title, b.continuation])).toEqual([
      [undefined, false],
      [undefined, true],
      ['Verse', false],
    ]);
  });

  it('keeps a blank line inside a section as a gap row', () => {
    const verse = format(doc, { showTabs: true }).find((b) => b.title === 'Verse 2')!;
    expect(verse.rows.map((r) => r.type)).toEqual(['pair', 'pair', 'gap', 'pair', 'pair']);
  });

  it('drops gaps that would only separate hidden rows', () => {
    const sheet = parseSheet('[Solo]\ne|--0--2--|\n\nla la\n\ne|--0--2--|');
    expect(format(sheet, { showTabs: false })[0]!.rows).toEqual([{ type: 'lyric', text: 'la la' }]);
  });

  it('hides tablature when asked', () => {
    const riff = (showTabs: boolean) => format(doc, { showTabs }).find((b) => b.title === 'Riff')!;
    expect(riff(true).rows).toHaveLength(6);
    expect(riff(false).rows).toHaveLength(0);
  });

  it('drops chords from blocks with showChords off (FR-N2 hook)', () => {
    const hidden = parseSheet('G     D\nWords go here\nC');
    hidden.blocks[0]!.meta.showChords = false;
    expect(format(hidden, { showTabs: true })[0]!.rows).toEqual([{ type: 'lyric', text: 'Words go here' }]);
  });

  it('leaves out hidden blocks (FR-N1)', () => {
    const doc = parseSheet('[Verse]\nla\n\n[Chorus]\nlo');
    doc.blocks[0]!.meta.visible = false;
    expect(format(doc, { showTabs: true }).map((b) => b.title)).toEqual(['Chorus']);
  });

  it('skips untitled blocks that end up empty', () => {
    expect(format(parseSheet('e|-----0-----|'), { showTabs: false })).toEqual([]);
  });
});

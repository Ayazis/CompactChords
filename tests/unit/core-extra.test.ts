import fc from 'fast-check';
import { arrange, format, parseLines, parseSheet } from '../../src/core';
import { headerTitle, isChordToken, isNeutralToken, isTabStaff, parseChord } from '../../src/core/chord-grammar';
import { normalizeLine, normalizeText, stripMarkup } from '../../src/core/normalizer';
import { pairSegments } from '../../src/core/formatter';
import { DEFAULT_SHEET_SETTINGS, type SheetSettings } from '../../src/core/songs';
import { tokenize } from '../../src/core/tokenizer';
import {
  detectKey,
  keyName,
  keyUsesFlats,
  noteIndex,
  noteName,
  transposeChord,
  transposeLine,
} from '../../src/core/transpose';

const settings = (patch: Partial<SheetSettings> = {}): SheetSettings => ({ ...structuredClone(DEFAULT_SHEET_SETTINGS), ...patch });
const SEED = 20261028;

describe('chord grammar: every common chord shape', () => {
  const roots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const shapes = [
    '', 'm', '7', 'm7', 'maj7', 'M7', 'min', 'min7', 'dim', 'dim7', 'aug', '+', '5', '6', 'm6', '9', 'm9', 'maj9', '11', '13',
    'sus', 'sus2', 'sus4', '7sus', '7sus4', 'add9', 'madd9', 'add11', '6/9', 'm7b5', '7b9', '7#9', '7#5', '7b5', 'maj7#11', 'm(maj7)', '7(b9)', 'maj7(#11)', '(add9)', '-', '-7',
  ];

  it.each(roots)('%s with any shape is a chord and survives a parse', (root) => {
    for (const shape of shapes) {
      const chord = `${root}${shape}`;
      expect(isChordToken(chord)).toBe(true);
      const parts = parseChord(chord)!;
      expect(`${parts.root}${parts.quality}`).toBe(chord);
    }
  });

  it.each(['C/E', 'D/F#', 'Am/G', 'G/B', 'C/Bb', 'Em7/D', 'Cmaj7/G', 'C6/9/E'])('slash chord %s', (chord) => {
    expect(isChordToken(chord)).toBe(true);
    expect(parseChord(chord)!.bass).toBeDefined();
  });

  it.each(['H', 'Bbb', 'Cx', 'c', 'am', 'Hello', 'Add', 'Dad', 'Bad', 'Gone', 'Fade', 'Cat', 'Am-', '', 'C/', '/E', 'C//E', 'C/H', '1', '7', 'x2'])(
    '%p is not a chord',
    (token) => {
      expect(isChordToken(token)).toBe(false);
    },
  );

  it('handles stray brackets around a chord but keeps balanced ones', () => {
    expect(parseChord('(G')).toMatchObject({ lead: '(', root: 'G', trail: '' });
    expect(parseChord('C)')).toMatchObject({ root: 'C', trail: ')' });
    expect(parseChord('((G))')).toBeDefined();
    expect(parseChord('A7(b9)')).toMatchObject({ quality: '7(b9)', trail: '' });
  });

  it('knows neutral tokens', () => {
    for (const token of ['|', '||', ':', '%', 'N.C.', 'NC', 'n.c.', '(x2)', 'x3', '2x', '(4x)', '-', '–', '/', '.', 'Intro:', 'Verse 2:', 'Pre-Chorus:']) {
      expect(isNeutralToken(token)).toBe(true);
    }
    for (const token of ['G', 'hello', 'Intro', 'x']) expect(isNeutralToken(token)).toBe(false);
  });

  it('recognises section headers', () => {
    for (const [line, title] of [
      ['[Intro]', 'Intro'],
      ['  [Verse 1]  ', 'Verse 1'],
      ['[Pre-Chorus]', 'Pre-Chorus'],
      ['[Guitar Solo]', 'Guitar Solo'],
      ['Chorus', 'Chorus'],
      ['CHORUS:', 'CHORUS'],
      ['Verse 2', 'Verse 2'],
      ['Outro x2', 'Outro x2'],
      ['Bridge (x3)', 'Bridge (x3)'],
    ] as const) {
      expect(headerTitle(line)).toBe(title);
    }
    for (const line of ['Verse of the song', 'Chorus line is long', 'hello', '', '[open', 'G  D']) expect(headerTitle(line)).toBeUndefined();
  });

  it('recognises tab staffs but not ordinary text', () => {
    for (const line of ['e|--0--2--|', 'B|---3-----|', '  E|-3-----', '|--0--1--|', 'D|--0h2p0--|', 'e|-0-2-3-|  (x2)', 'a|-----|']) {
      expect(isTabStaff(line)).toBe(true);
    }
    for (const line of ['', 'hello|there', '| C | G |', 'e|-0|', 'x|--0--|']) expect(isTabStaff(line)).toBe(false);
  });
});

describe('normalizer and tokenizer', () => {
  it('maps unicode accidentals and odd spaces', () => {
    expect(normalizeLine('B♭ F♯m C')).toBe('Bb F#m C');
    expect(normalizeLine('G D A')).toBe('G D A');
  });

  it('expands tabs to 4-column stops and trims line ends', () => {
    expect(normalizeLine('G\tD   ')).toBe('G   D');
    expect(normalizeLine('\tG')).toBe('    G');
    expect(normalizeLine('ab\tG')).toBe('ab  G');
  });

  it('splits text on any newline style', () => {
    expect(normalizeText('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('strips only the supported markup', () => {
    expect(stripMarkup('[ch]Am[/ch] [tab]x[/tab] [Chorus] [chx]')).toBe('Am x [Chorus] [chx]');
  });

  it('tokenizes with the column of every token', () => {
    expect(tokenize('  G   D/F#  ')).toEqual([
      { text: 'G', start: 2 },
      { text: 'D/F#', start: 6 },
    ]);
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('transposition', () => {
  const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  it('every chord moves by every interval and wraps correctly', () => {
    for (let root = 0; root < 12; root++) {
      for (let shift = -11; shift <= 11; shift++) {
        const expected = sharpNames[(((root + shift) % 12) + 12) % 12]!;
        expect(transposeChord(`${sharpNames[root]}m7`, shift, false)).toBe(`${expected}m7`);
      }
    }
  });

  it('transposes the bass note too, and keeps brackets and qualities', () => {
    expect(transposeChord('D/F#', 2, false)).toBe('E/G#');
    expect(transposeChord('(Am7/G)', 3, false)).toBe('(Cm7/A#)'.replace('A#', 'A#'));
    expect(transposeChord('C6/9', 2, false)).toBe('D6/9');
    expect(transposeChord('G(b9)', 1, true)).toBe('Ab(b9)');
  });

  it('leaves non-chords alone', () => {
    for (const token of ['hello', '|', 'N.C.', '(x2)']) expect(transposeChord(token, 5, false)).toBe(token);
  });

  it('a full octave and a round trip are the identity on pitch classes', () => {
    fc.assert(
      fc.property(fc.constantFrom(...sharpNames), fc.constantFrom('', 'm', '7', 'maj7', 'sus4'), fc.integer({ min: -11, max: 11 }), (root, quality, shift) => {
        const chord = `${root}${quality}`;
        expect(transposeChord(chord, 12, false)).toBe(chord);
        expect(transposeChord(transposeChord(chord, shift, false), -shift, false)).toBe(chord);
      }),
      { seed: SEED },
    );
  });

  it('names notes with sharps or flats and reads them back', () => {
    for (let index = 0; index < 12; index++) {
      expect(noteIndex(noteName(index, true))).toBe(index);
      expect(noteIndex(noteName(index, false))).toBe(index);
    }
    expect(noteName(-1, false)).toBe('B');
    expect(noteName(13, true)).toBe('Db');
    expect(noteIndex('Cb')).toBe(11);
    expect(noteIndex('E#')).toBe(5);
  });

  it('transposeLine never makes two chords touch and keeps untouched columns', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('C', 'D', 'F#m', 'Bbmaj7', 'G/B'), fc.integer({ min: 1, max: 6 })), { minLength: 1, maxLength: 8 }), fc.integer({ min: -11, max: 11 }), (parts, shift) => {
        const raw = parts.map(([chord, gap]) => chord + ' '.repeat(gap)).join('').trimEnd();
        const [line] = parseLines(raw);
        const out = transposeLine(line!, shift, false);
        const tokens = out.tokens;
        for (let i = 1; i < tokens.length; i++) {
          expect(tokens[i]!.start).toBeGreaterThanOrEqual(tokens[i - 1]!.start + tokens[i - 1]!.text.length + 1);
        }
        expect(out.tokens.map((token) => token.text)).toEqual(out.raw.split(/\s+/).filter(Boolean));
        out.tokens.forEach((token) => expect(out.raw.slice(token.start, token.start + token.text.length)).toBe(token.text));
      }),
      { seed: SEED },
    );
  });
});

describe('key detection', () => {
  const key = (text: string) => {
    const detected = detectKey(parseSheet(text));
    return detected && keyName(detected, keyUsesFlats(detected));
  };

  it.each([
    ['C  F  G  C', 'C'],
    ['G  C  D  G', 'G'],
    ['Am  F  C  G  Am', 'Am'],
    ['Em  C  G  D  Em', 'Em'],
    ['F  Bb  C  F', 'F'],
    ['Dm  Gm  A7  Dm', 'Dm'],
    ['E  A  B  E', 'E'],
    ['Bb  Eb  F  Bb', 'Bb'],
  ])('%s is in %s', (chords, expected) => {
    expect(key(chords)).toBe(expected);
  });

  it('is stable when transposed', () => {
    for (let shift = 0; shift < 12; shift++) {
      const doc = parseSheet('C  F  G  C\nAm  Dm  G  C');
      const moved = arrange(doc, settings({ transpose: shift > 11 ? 0 : shift }));
      const detected = detectKey(moved.doc)!;
      expect(detected).toEqual({ root: shift, minor: false });
    }
  });

  it('knows which keys read with flats', () => {
    expect(keyUsesFlats({ root: 5, minor: false })).toBe(true);
    expect(keyUsesFlats({ root: 2, minor: true })).toBe(true);
    expect(keyUsesFlats({ root: 7, minor: false })).toBe(false);
    expect(keyUsesFlats({ root: 4, minor: true })).toBe(false);
  });
});

describe('arrange with every setting', () => {
  const text = '[Verse]\nC  F  G  C\nwords words words words\n\n[Chorus]\nAm  G\nmore words here';

  it('never changes lyrics, headers or structure', () => {
    fc.assert(
      fc.property(fc.integer({ min: -11, max: 11 }), fc.integer({ min: 0, max: 11 }), fc.constantFrom('auto', 'sharp', 'flat'), (transpose, capo, accidentals) => {
        const doc = parseSheet(text);
        const { doc: out } = arrange(doc, settings({ transpose, capo, accidentals }));
        expect(out.blocks.map((block) => [block.id, block.title])).toEqual(doc.blocks.map((block) => [block.id, block.title]));
        const lyrics = (d: typeof doc) => d.blocks.flatMap((block) => block.lines.filter((line) => line.kind === 'Lyric').map((line) => line.raw));
        expect(lyrics(out)).toEqual(lyrics(doc));
      }),
      { seed: SEED },
    );
  });

  it('transposing and then using a capo of the same size shows the original shapes', () => {
    for (let n = 1; n <= 11; n++) {
      const { doc } = arrange(parseSheet(text), settings({ transpose: n, capo: n }));
      expect(doc.blocks[0]!.lines[0]!.raw).toBe('C  F  G  C');
    }
  });

  it('reports the sounding key of a capoed, transposed song', () => {
    const { keys } = arrange(parseSheet(text), settings({ transpose: 2, capo: 3 }));
    expect(keys).toEqual({ original: 'C', sounding: 'D', shapes: 'B' });
  });

  it('has no keys for a lyric-only song and does not crash when transposing it', () => {
    const arranged = arrange(parseSheet('only words'), settings({ transpose: 5, capo: 2, accidentals: 'flat' }));
    expect(arranged.keys).toBeUndefined();
    expect(arranged.doc.blocks[0]!.lines[0]!.raw).toBe('only words');
  });

  it('handles an empty document', () => {
    expect(arrange(parseSheet(''), settings({ transpose: 3 })).doc.blocks).toEqual([]);
  });

  it('does not mutate its input', () => {
    const doc = parseSheet(text);
    const before = JSON.stringify(doc);
    arrange(doc, settings({ transpose: 4, hiddenBlocks: ['B0'], chordlessBlocks: ['B1'] }));
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('ignores hidden ids that do not exist', () => {
    const { doc } = arrange(parseSheet(text), settings({ hiddenBlocks: ['B99'] }));
    expect(doc.blocks.every((block) => block.meta.visible)).toBe(true);
  });
});

describe('formatting edge cases', () => {
  const rows = (text: string, showTabs = true) => format(parseSheet(text), { showTabs }).flatMap((block) => block.rows);

  it('pairs a chord line with the lyric only when the lyric follows directly', () => {
    expect(rows('G  D\nHello there')[0]).toMatchObject({ type: 'pair' });
    expect(rows('G  D\n\nHello there').map((row) => row.type)).toEqual(['chords', 'lyric']);
  });

  it('keeps two chord lines in a row as separate lines', () => {
    expect(rows('G  D\nC  F\nwords').map((row) => row.type)).toEqual(['chords', 'pair']);
  });

  it('keeps chords past the end of a short lyric', () => {
    const [row] = rows('G         D\nhi');
    expect(row).toMatchObject({ type: 'pair', segments: [{ chord: 'G', text: 'hi        ' }, { chord: 'D', text: '' }] });
  });

  it('keeps leading text before the first chord', () => {
    const [chordLine] = parseLines('    G');
    expect(pairSegments(chordLine!, 'Oh my')).toEqual([{ text: 'Oh m' }, { chord: 'G', text: 'y' }]);
  });

  it('shows a titled block even when everything in it is hidden tab', () => {
    const blocks = format(parseSheet('[Riff]\ne|--0--0--|'), { showTabs: false });
    expect(blocks).toMatchObject([{ title: 'Riff', rows: [] }]);
  });

  it('renders an empty document as nothing', () => {
    expect(format(parseSheet(''), { showTabs: true })).toEqual([]);
    expect(format(parseSheet('\n\n  \n'), { showTabs: true })).toEqual([]);
  });

  it('survives hundreds of lines, windows newlines and odd characters', () => {
    const text = 'G  D\r\nSüß ünd 日本語 🎸\r\n'.repeat(300);
    expect(format(parseSheet(text), { showTabs: true }).flatMap((block) => block.rows)).toHaveLength(300);
  });

  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        const doc = parseSheet(text);
        arrange(doc, settings({ transpose: 3, capo: 1 }));
        format(doc, { showTabs: true });
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('block ids stay unique and sequential', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('[Verse]', 'G  D', 'words', '', 'e|--0--0--|', 'Chorus:'), { maxLength: 40 }), (lines) => {
        const ids = parseSheet(lines.join('\n')).blocks.map((block) => block.id);
        expect(ids).toEqual(ids.map((_, i) => `B${i}`));
      }),
      { seed: SEED },
    );
  });
});

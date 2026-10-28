import { arrange, parseLines, parseSheet } from '../../src/core';
import { parseChord } from '../../src/core/chord-grammar';
import { DEFAULT_SHEET_SETTINGS, type SheetSettings } from '../../src/core/songs';
import {
  detectKey,
  keyName,
  keyUsesFlats,
  noteIndex,
  noteName,
  prefersFlats,
  transposeChord,
  transposeDocument,
  transposeLine,
} from '../../src/core/transpose';
import { exampleSheet } from '../helpers';

describe('parseChord', () => {
  it.each([
    ['G', { lead: '', root: 'G', quality: '', trail: '' }],
    ['Bbm7', { lead: '', root: 'Bb', quality: 'm7', trail: '' }],
    ['D/F#', { lead: '', root: 'D', quality: '', bass: 'F#', trail: '' }],
    ['Am(maj7)', { lead: '', root: 'A', quality: 'm(maj7)', trail: '' }],
    ['(G', { lead: '(', root: 'G', quality: '', trail: '' }],
    ['C7sus4)', { lead: '', root: 'C', quality: '7sus4', trail: ')' }],
  ])('splits %s', (token, parts) => expect(parseChord(token)).toEqual(parts));

  it('ignores tokens that are not chords', () => {
    expect(parseChord('(x2)')).toBeUndefined();
  });
});

describe('notes', () => {
  it('maps note names to pitch classes and back', () => {
    expect(['C', 'C#', 'Db', 'E', 'Fb', 'B#', 'Bb'].map(noteIndex)).toEqual([0, 1, 1, 4, 4, 0, 10]);
    expect(noteName(13, false)).toBe('C#');
    expect(noteName(-2, true)).toBe('Bb');
  });
});

describe('transposeChord', () => {
  it.each([
    ['G', 2, false, 'A'],
    ['Em7', 2, false, 'F#m7'],
    ['D/F#', -2, true, 'C/E'],
    ['Bb', 1, false, 'B'],
    ['Cadd9', 3, true, 'Ebadd9'],
    ['(Am7)', 5, false, '(Dm7)'],
    ['N.C.', 4, false, 'N.C.'],
    ['|', 4, false, '|'],
  ])('%s %+d → %s', (chord, semitones, flats, expected) =>
    expect(transposeChord(chord, semitones, flats)).toBe(expected),
  );

  it('is undone by transposing back', () => {
    for (const chord of ['C#m7b5/G#', 'F#sus4', 'Ebmaj7', 'A7(b9)']) {
      for (let s = -11; s <= 11; s++) {
        const there = transposeChord(chord, s, false);
        expect(noteIndex(parseChord(transposeChord(there, -s, false))!.root)).toBe(noteIndex(parseChord(chord)!.root));
      }
    }
  });
});

describe('transposeLine', () => {
  const chordLine = (text: string) => parseLines(text)[0]!;

  it('keeps chords at their columns when there is room', () => {
    expect(transposeLine(chordLine('G       C   D'), 1, false).raw).toBe('G#      C#  D#');
  });

  it('pushes a chord along only when the previous one grew into it', () => {
    const line = transposeLine(chordLine('E F G'), 1, false);
    expect(line.raw).toBe('F F# G#');
    expect(line.tokens.map((t) => t.start)).toEqual([0, 2, 5]);
  });

  it('keeps leading indentation and neutral tokens', () => {
    expect(transposeLine(chordLine('   G  D  (x2)'), 2, false).raw).toBe('   A  E  (x2)');
  });
});

describe('detectKey', () => {
  const key = (text: string) => {
    const found = detectKey(parseSheet(text));
    return found && keyName(found, keyUsesFlats(found));
  };

  it.each([
    ['G D Em C', 'G'],
    ['Am F C G Am', 'Am'],
    ['F Bb C F', 'F'],
    ['Dm Gm A7 Dm', 'Dm'],
    ['E A B7 E', 'E'],
  ])('finds the key of %s', (chords, expected) => expect(key(chords)).toBe(expected));

  it('finds G for the example song', () => {
    expect(key(exampleSheet)).toBe('G');
  });

  it('is undefined without chords', () => {
    expect(detectKey(parseSheet('Only words here'))).toBeUndefined();
  });
});

describe('prefersFlats', () => {
  it('follows the key in auto mode and the user otherwise', () => {
    expect(prefersFlats({ root: 5, minor: false }, 'auto')).toBe(true); // F
    expect(prefersFlats({ root: 7, minor: false }, 'auto')).toBe(false); // G
    expect(prefersFlats({ root: 2, minor: true }, 'auto')).toBe(true); // Dm
    expect(prefersFlats(undefined, 'auto')).toBe(false);
    expect(prefersFlats({ root: 7, minor: false }, 'flat')).toBe(true);
    expect(prefersFlats({ root: 5, minor: false }, 'sharp')).toBe(false);
  });
});

describe('transposeDocument', () => {
  it('changes chord lines and leaves lyrics alone', () => {
    const doc = transposeDocument(parseSheet('G     D\nAm I dreaming\nA little song'), 2, false);
    expect(doc.blocks[0]!.lines.map((l) => l.raw)).toEqual(['A     E', 'Am I dreaming', 'A little song']);
  });
});

describe('arrange', () => {
  const settings = (patch: Partial<SheetSettings>): SheetSettings => ({ ...DEFAULT_SHEET_SETTINGS, ...patch });
  const firstChordLine = (patch: Partial<SheetSettings>) =>
    arrange(parseSheet('G  D  Em  C\nWords'), settings(patch)).doc.blocks[0]!.lines[0]!.raw;

  it('leaves chords exactly as written by default', () => {
    const doc = parseSheet(exampleSheet);
    expect(arrange(doc, DEFAULT_SHEET_SETTINGS).doc.blocks.map((b) => b.lines)).toEqual(doc.blocks.map((b) => b.lines));
  });

  it('transposes, and a capo moves the shapes back down', () => {
    expect(firstChordLine({ transpose: 2 })).toBe('A  E  F#m D');
    expect(firstChordLine({ transpose: 2, capo: 2 })).toBe('G  D  Em  C');
    expect(firstChordLine({ capo: 2 })).toBe('F  C  Dm  Bb');
  });

  it('uses the chosen accidentals', () => {
    expect(firstChordLine({ transpose: 1, accidentals: 'flat' })).toBe('Ab Eb Fm  Db');
    expect(firstChordLine({ transpose: 1, accidentals: 'sharp' })).toBe('G# D# Fm  C#');
  });

  it('reports original, sounding and shape keys', () => {
    expect(arrange(parseSheet('G D Em C G'), settings({ transpose: 2, capo: 2 })).keys).toEqual({
      original: 'G',
      sounding: 'A',
      shapes: 'G',
    });
    expect(arrange(parseSheet('just words'), DEFAULT_SHEET_SETTINGS).keys).toBeUndefined();
  });

  it('applies hidden and chordless sections', () => {
    const doc = arrange(parseSheet('[A]\nG\nla\n\n[B]\nC\nla'), settings({ hiddenBlocks: ['B0'], chordlessBlocks: ['B1'] })).doc;
    expect(doc.blocks.map((b) => b.meta)).toEqual([
      { visible: false, showChords: true },
      { visible: true, showChords: false },
    ]);
  });
});

describe('roman numerals', () => {
  it('uses lower case for minor chords, relative to the key', async () => {
    const { romanChord } = await import('../../src/core/transpose');
    const g = { root: 7, minor: false };
    expect(romanChord('G', g)).toBe('I');
    expect(romanChord('Em7', g)).toBe('vi7');
    expect(romanChord('D/F#', g)).toBe('V/VII');
    expect(romanChord('Bb', g)).toBe('bIII');
    expect(romanChord('F#dim', g)).toBe('viidim');
    expect(romanChord('Am', { root: 9, minor: true })).toBe('vi');
  });
});

describe('key choice', () => {
  const sheet = parseSheet('Am F C G\nla la la la');
  const settings = (patch: Partial<SheetSettings>): SheetSettings => ({ ...DEFAULT_SHEET_SETTINGS, ...patch });

  it('tells a minor key from its relative major', () => {
    expect(detectKey(sheet)).toEqual({ root: 9, minor: true });
    expect(detectKey(parseSheet('C G Am F\nla la la la'))).toEqual({ root: 0, minor: false });
  });

  it('uses the chosen key instead of the detected one', () => {
    expect(arrange(sheet, settings({ key: 'C' })).keys?.original).toBe('C');
    expect(arrange(sheet, settings({ key: 'C', nashville: true })).doc.blocks[0]!.lines[0]!.raw).toBe('vi IV I V');
  });
});

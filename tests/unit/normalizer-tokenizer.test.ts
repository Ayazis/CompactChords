import { normalizeLine, normalizeText, stripMarkup } from '../../src/core/normalizer';
import { tokenize } from '../../src/core/tokenizer';

describe('normalizer', () => {
  it('maps Unicode accidentals to ASCII', () => {
    expect(normalizeLine('B♭  F♯m')).toBe('Bb  F#m');
  });

  it('keeps leading spaces and inner spacing but trims the end', () => {
    expect(normalizeLine('   G     D   ')).toBe('   G     D');
  });

  it('expands tabs to 4-column stops', () => {
    expect(normalizeLine('G\tD')).toBe('G   D');
    expect(normalizeLine('Em\tC')).toBe('Em  C');
  });

  it('turns non-breaking spaces into spaces', () => {
    expect(normalizeLine('G  D')).toBe('G  D');
  });

  it('strips tab-site markup', () => {
    expect(stripMarkup('[tab][ch]G[/ch]   [ch]D[/ch]\nWords[/tab]')).toBe('G   D\nWords');
  });

  it('splits on any line ending', () => {
    expect(normalizeText('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('tokenizer', () => {
  it('records the column of every token', () => {
    expect(tokenize('  G   Em7  D/F#')).toEqual([
      { text: 'G', start: 2 },
      { text: 'Em7', start: 6 },
      { text: 'D/F#', start: 11 },
    ]);
  });

  it('returns nothing for a blank line', () => {
    expect(tokenize('    ')).toEqual([]);
  });
});

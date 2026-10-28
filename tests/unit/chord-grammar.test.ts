import { headerTitle, isChordToken, isNeutralToken, isTabStaff } from '../../src/core/chord-grammar';

describe('isChordToken', () => {
  it.each([
    'A', 'C#', 'Bb', 'Am', 'F#m', 'Cmaj7', 'Cm7b5', 'C7sus4', 'Dsus2', 'Dsus', 'Cadd9', 'E5', 'G/B',
    'D/F#', 'Bdim', 'Caug', 'A7(b9)', 'Am(maj7)', 'C+', 'Cm9', 'G13', 'Ebmaj7', '(G', 'C)',
  ])('accepts %s', (token) => expect(isChordToken(token)).toBe(true));

  it.each(['a', 'Hello', 'Am I', 'Do', 'Cm7b5x', 'H7', 'I', 'G/', 'line,', '(hold)', 'Gmaj7)x'])(
    'rejects %s',
    (token) => expect(isChordToken(token)).toBe(false),
  );
});

describe('isNeutralToken', () => {
  it.each(['|', '||', '(x2)', 'x4', '2x', 'N.C.', 'NC', '%', 'Intro:', 'Outro:', '-'])(
    'treats %s as neutral',
    (token) => expect(isNeutralToken(token)).toBe(true),
  );

  it.each(['G', 'hold', 'Intro'])('does not treat %s as neutral', (token) =>
    expect(isNeutralToken(token)).toBe(false),
  );
});

describe('headerTitle', () => {
  it.each([
    ['[Chorus]', 'Chorus'],
    ['  [Verse 1]  ', 'Verse 1'],
    ['Verse 2:', 'Verse 2'],
    ['BRIDGE', 'BRIDGE'],
    ['Chorus x2', 'Chorus x2'],
    ['Pre-Chorus', 'Pre-Chorus'],
  ])('reads %s', (line, title) => expect(headerTitle(line)).toBe(title));

  it.each(['Intro: G D', 'The chorus is here', 'G  D'])('ignores %s', (line) =>
    expect(headerTitle(line)).toBeUndefined(),
  );
});

describe('isTabStaff', () => {
  it.each([
    'e|-----3---|',
    'B|--1h3--0-|',
    '|---0---2---|',
    'D#|--------|',
    'A|----5/7---| x2',
    'e|---------|     e|------|',
    'G|---------| (x3)  G|----| --> TO VERSE',
  ])('accepts %s', (line) => expect(isTabStaff(line)).toBe(true));

  it.each(['| Bm | C | Am |', 'e|-|', 'G  D  Em', 'A|- hello world', '|-- x'])('rejects %s', (line) =>
    expect(isTabStaff(line)).toBe(false),
  );
});

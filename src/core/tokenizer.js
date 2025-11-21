const WORD_PATTERN = /[A-Za-z0-9#b♯♭/]+|[^\s]/g;

export const tokenizeLine = (line) => {
  if (!line) {
    return [];
  }

  const matches = line.match(WORD_PATTERN);

  if (!matches) {
    return [];
  }

  return matches.map((match) => ({
    value: match,
    type: /^[A-Za-z0-9#b♯♭/]+$/.test(match) ? "word" : "symbol",
  }));
};

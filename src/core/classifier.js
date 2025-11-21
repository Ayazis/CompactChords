import { isChordToken } from "./chord-grammar.js";

const DEFAULT_THRESHOLD = 0.6;
const LONG_WORD_LENGTH = 4;
const LONG_WORD_PENALTY = 0.1;

const isBlankLine = (line) => line.trim().length === 0;

export const classifyLine = (line, tokens, config = {}) => {
  const threshold = config.classifierThreshold ?? DEFAULT_THRESHOLD;

  if (isBlankLine(line)) {
    return {
      type: "Blank",
      score: 0,
    };
  }

  const consideredTokens = tokens.filter((token) => token.type === "word");
  const validChordTokens = consideredTokens.filter((token) =>
    isChordToken(token.value)
  );
  const ratio =
    consideredTokens.length === 0
      ? 0
      : validChordTokens.length / consideredTokens.length;

  const penalties =
    consideredTokens.filter(
      (token) => /^[A-Za-z]+$/.test(token.value) && token.value.length > LONG_WORD_LENGTH
    ).length * LONG_WORD_PENALTY;

  const score = Math.max(0, ratio - penalties);

  return {
    type: score >= threshold ? "Chord" : "Lyric",
    score,
  };
};

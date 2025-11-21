import { normalizeText } from "../core/normalizer.js";
import { tokenizeLine } from "../core/tokenizer.js";
import { classifyLine } from "../core/classifier.js";
import { segmentLines } from "../core/segmenter.js";
import { formatBlocks } from "../core/formatter.js";

export const defaultConfig = {
  classifierThreshold: 0.6,
};

const createLineModel = (normalized, index, config) => {
  const tokens = tokenizeLine(normalized);
  const classification = classifyLine(normalized, tokens, config);

  return {
    id: `line-${index}`,
    index,
    normalized,
    tokens,
    classification,
  };
};

const createStats = (lines) => ({
  totalLines: lines.length,
  chordLines: lines.filter((line) => line.classification.type === "Chord").length,
  lyricLines: lines.filter((line) => line.classification.type === "Lyric").length,
  blankLines: lines.filter((line) => line.classification.type === "Blank").length,
});

export const processSong = (input, overrideConfig = {}) => {
  const config = { ...defaultConfig, ...overrideConfig };
  const normalizedLines = normalizeText(input ?? "");
  const lineModels = normalizedLines.map((line, index) =>
    createLineModel(line, index, config)
  );

  const blocks = segmentLines(lineModels);
  const formattedBlocks = formatBlocks(blocks);

  return {
    input,
    lines: lineModels,
    blocks: formattedBlocks,
    stats: createStats(lineModels),
  };
};

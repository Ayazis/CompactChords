let blockId = 0;

const createBlock = (seedLine) => ({
  id: `block-${blockId++}`,
  kind: seedLine.classification.type,
  lines: [seedLine],
});

const pushBlock = (blocks, block) => {
  if (block) {
    blocks.push(block);
  }
};

const isHeaderLine = (line) => /\[[^\]]+\]|:\s*$/.test(line.normalized);

export const segmentLines = (lines) => {
  blockId = 0;
  const blocks = [];
  let currentBlock = null;

  lines.forEach((line) => {
    if (line.classification.type === "Blank") {
      pushBlock(blocks, currentBlock);
      currentBlock = null;
      return;
    }

    if (!currentBlock) {
      currentBlock = createBlock(line);
      currentBlock.label = isHeaderLine(line)
        ? line.normalized.trim()
        : line.classification.type;
      return;
    }

    currentBlock.lines.push(line);
  });

  pushBlock(blocks, currentBlock);
  return blocks;
};

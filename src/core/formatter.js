const formatBlockLabel = (block) => {
  if (block.label && block.label !== block.kind) {
    return block.label;
  }

  return block.kind;
};

export const formatBlocks = (blocks) =>
  blocks.map((block, index) => {
    const label = formatBlockLabel(block);
    const content = block.lines.map((line) => line.normalized || "").join("\n");

    return {
      id: block.id,
      index,
      label,
      kind: block.kind,
      content,
      visible: true,
    };
  });

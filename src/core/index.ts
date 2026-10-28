import { classifyLine } from './classifier';
import { normalizeText } from './normalizer';
import { segment } from './segmenter';
import { tokenize } from './tokenizer';
import { DEFAULT_CONFIG, type CoreConfig, type Line, type SheetDocument } from './types';

export * from './types';
export { format, type RenderBlock, type Row, type Segment } from './formatter';
export { arrange, type Arrangement, type Keys } from './arrange';

export function parseLines(text: string, config: CoreConfig = DEFAULT_CONFIG): Line[] {
  return normalizeText(text).map((raw, i) => {
    const tokens = tokenize(raw);
    return { id: `L${i}`, raw, tokens, ...classifyLine(raw, tokens, config) };
  });
}

export function parseSheet(text: string, config: CoreConfig = DEFAULT_CONFIG): SheetDocument {
  return { blocks: segment(parseLines(text, config)) };
}

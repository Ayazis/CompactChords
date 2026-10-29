import { inflateSync } from 'node:zlib';

/** Where a run of text starts, in CSS pixels from the top left of the printed area. */
export interface TextRun {
  x: number;
  y: number;
}

/**
 * Reads the text positions of each page of a PDF printed by Chromium. Only
 * what Chromium (Skia) writes is supported: one content stream per page, and
 * each text object placed with "1 0 0 -1 x y Tm" in CSS pixels, then moved
 * with "dx dy Td".
 */
export function readPdf(pdf: Buffer): TextRun[][] {
  const text = pdf.toString('latin1');
  const objects = new Map<string, number>();
  for (const match of text.matchAll(/(\d+) 0 obj\b/g)) objects.set(match[1]!, match.index!);

  const objectText = (id: string) => {
    const start = objects.get(id);
    if (start === undefined) throw new Error(`PDF object ${id} not found`);
    return text.slice(start, text.indexOf('endobj', start));
  };

  const contents = (id: string) => {
    const body = objectText(id);
    const marker = /stream\r?\n/.exec(body)!;
    const dictionary = body.slice(0, marker.index);
    const start = objects.get(id)! + marker.index + marker[0].length;
    const data = pdf.subarray(start, start + Number(/\/Length (\d+)/.exec(dictionary)![1]));
    return (/\/FlateDecode/.test(dictionary) ? inflateSync(data) : data).toString('latin1');
  };

  // Page objects in document order: the page tree lists them as /Kids.
  const pageIds = (id: string): string[] => {
    const body = objectText(id);
    if (/\/Type\s*\/Pages\b/.test(body)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body)![1]!;
      return [...kids.matchAll(/(\d+) 0 R/g)].flatMap((kid) => pageIds(kid[1]!));
    }
    return [id];
  };
  const root = /\/Root (\d+) 0 R/.exec(text)![1]!;
  const tree = /\/Pages (\d+) 0 R/.exec(objectText(root))![1]!;

  return pageIds(tree).map((page) => {
    const ref = /\/Contents (\d+) 0 R/.exec(objectText(page))?.[1];
    if (!ref) return [];
    const runs: TextRun[] = [];
    let x = 0;
    let y = 0;
    for (const op of contents(ref).matchAll(/1 0 0 -1 (-?[\d.]+) (-?[\d.]+) Tm|(-?[\d.]+) (-?[\d.]+) Td|\bTj\b|\bTJ\b/g)) {
      if (op[1] !== undefined) [x, y] = [Number(op[1]), Number(op[2])];
      else if (op[3] !== undefined) [x, y] = [x + Number(op[3]), y - Number(op[4])];
      else runs.push({ x, y });
    }
    return runs;
  });
}

// Applies a song's sheet settings to a parsed document: transposition, capo
// and per-section visibility. Runs between parsing and the formatter.

import type { SheetSettings } from './songs';
import { detectKey, keyName, nashvilleDocument, parseKey, prefersFlats, shiftKey, transposeDocument } from './transpose';
import type { SheetDocument } from './types';

export interface Keys {
  /** Key as written in the source. */
  original: string;
  /** Key the song sounds in after transposing. */
  sounding: string;
  /** Key of the chord shapes on the sheet (differs from sounding with a capo). */
  shapes: string;
}

export interface Arrangement {
  doc: SheetDocument;
  /** Undefined when the song has no chords to detect a key from. */
  keys?: Keys;
}

export function arrange(doc: SheetDocument, settings: SheetSettings): Arrangement {
  const key = (settings.key !== 'auto' && parseKey(settings.key)) || detectKey(doc);
  const shift = settings.transpose - settings.capo;

  // Leave chords exactly as written unless something asks to change them.
  const shapesKey = key && shiftKey(key, shift);
  // Numbers are relative to the key, so transposing and the capo don't change them.
  const transposed =
    settings.nashville && key
      ? nashvilleDocument(doc, key)
      : shift === 0 && settings.accidentals === 'auto'
        ? doc
        : transposeDocument(doc, shift, prefersFlats(shapesKey, settings.accidentals));

  const hidden = new Set(settings.hiddenBlocks);
  const chordless = new Set(settings.chordlessBlocks);
  const arranged: Arrangement = {
    doc: {
      blocks: transposed.blocks.map((block) => ({
        ...block,
        meta: { visible: !hidden.has(block.id), showChords: !chordless.has(block.id) },
      })),
    },
  };

  if (key && shapesKey) {
    const sounding = shiftKey(key, settings.transpose);
    const name = (k: typeof key) => keyName(k, prefersFlats(k, settings.accidentals));
    arranged.keys = { original: name(key), sounding: name(sounding), shapes: name(shapesKey) };
  }
  return arranged;
}

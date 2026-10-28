# Architecture

## Overview
Pure-core pipeline plus thin UI shell, delivered as static files. No runtime services; the local Vite server only adds optional development helpers (ADR-0003, ADR-0004).

```
text → normalizer → tokenizer → classifier → segmenter → arrange → formatter → ui
                                                          (transpose, capo,
                                                           section toggles)
```

## Module boundaries
- `tokenizer`
  - Input: raw line. Output: tokens with their column. Pure.
- `chord-grammar`
  - Chord token regex, `parseChord` (root, quality, bass), headers and tab staff detection.
- `normalizer`
  - Maps Unicode sharps/flats, expands tabs, trims line ends, strips tab-site markup. Keeps inner spacing for alignment.
- `classifier`
  - Inputs: tokens per line; Outputs: `Chord|Lyric|Blank|Header|Tab` with score. Uses ratio and grammar hits. Threshold configurable.
- `segmenter`
  - Groups lines into blocks by blank lines and headers. Pure.
- `transpose`
  - Transposes chords and chord lines (keeping columns), detects the key, picks sharps or flats. Pure.
- `arrange`
  - Applies a song's `SheetSettings` to a document: transposition minus capo, accidentals, hidden and chordless blocks. Reports original, sounding and shape keys.
- `formatter`
  - Transforms blocks to renderable rows; pairs chord lines with lyrics; drops hidden blocks and, per block, chords. Pure.
- `songs`
  - `StoredSong` and `SheetSettings` contracts, validation of untrusted data, song ids, library file format and merging. Pure.
- `importers`
  - Pure extractors from source pages and bookmarklet payloads to plain chord-sheet text (one tab site today).
- `app`
  - State `{song, dirty, library, lists, doc, arrangement}`; wires events to core, storage and renderers.
- `ui`
  - Render functions for the sheet, song list and sections list, plus all CSS (screen and print); no business logic.
- `platform`
  - Browser side effects: localStorage library, export/import files, bookmarklet, optional local-server calls, print.

## Data contracts
- Line
  ```
  { id: string, raw: string, tokens: Token[], kind: "Chord"|"Lyric"|"Blank"|"Header"|"Tab", confidence: number }
  ```
- Block
  ```
  { id: string, title?: string, lines: Line[], meta: { showChords: boolean, visible: boolean } }
  ```
- Document
  ```
  { blocks: Block[] }
  ```
- Sheet settings (saved per song)
  ```
  { chordPx, lyricPx, showTabs, columns: 1|2|3, transpose: -11..11, capo: 0..11,
    accidentals: "auto"|"sharp"|"flat", hiddenBlocks: string[], chordlessBlocks: string[] }
  ```
- Stored song
  ```
  { id, url?, title, details, text, settings: SheetSettings, savedAt }
  ```

## Algorithms
- Chord token regex: define once in `chord-grammar`. Allow roots A–G, accidentals `#|b|♯|♭`, suffixes `m|min|maj|dim|aug|sus(2|4)|add(9|11|13)|6|7|9|11|13`, optional slash bass.
- Line classification score = `(validChordTokens - penalty × longWords) / consideredTokens`, where long words are non-chord alphabetic words of 4+ letters and the penalty defaults to 1. Neutral tokens (`|`, `(x2)`, `N.C.`, `Intro:`) are not considered. Threshold default 0.6.
- Transposition moves root and bass by the semitone shift `transpose − capo`. A chord that gets longer only pushes the next chord when they would touch, so chords stay over their syllables.
- Key detection scores all 24 keys by how many chords fit the key's chords (major: I ii iii IV V vi vii°; minor adds a major V), plus a bonus when the song starts or ends on the tonic. Auto accidentals use flats for F, B♭, E♭, A♭, D♭ and their relative minors.
- Fit to one page: binary search over half-pixel lyric sizes (chord size keeps its ratio), measuring the rendered preview. It first looks for a size where no lyric line wraps, then allows wrapping.

## Error handling
- Invalid lines default to `Lyric` with low confidence; never crash.
- Stored data, imported library files and bookmarklet payloads are validated; invalid entries are skipped with a message.

## Printing and layout
- CSS columns (1–3); `break-inside: avoid` on blocks; monospace for chords; `@page` for A4.
- Lyric segments wrap within a column; tablature shrinks to the column width (container query units).
- The on-screen preview scales the A4 sheet to the available width; print ignores the scaling.

## Extensibility points
- Replace grammar via config.
- More importers next to `importers/tab-site.ts` (each a pure function to plain text).
- New per-song settings: add to `SheetSettings` with a default and a rule in `songs.ts`; older saves pick up the default.

## ADR references
- ADR-0001 Choose CSS columns + browser print over PDF library.
- ADR-0002 Pure-core vs UI separation.
- ADR-0003 Import from tab-site links (local server, pre-computed cache).
- ADR-0004 Static-first: browser library, export/import, bookmarklet.

## Separation of concerns principles
- Pure-core modules accept and return plain data; no DOM, no timers, no globals.
- UI reads state, renders DOM; zero business rules.
- `app` is the only place where user events trigger core execution.
- All thresholds and grammar live in a config object passed into core; tests can override it.

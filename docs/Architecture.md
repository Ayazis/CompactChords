# Architecture

## Overview
Pure-core pipeline plus thin UI shell. No runtime services.

## Product constraints
- Native JavaScript only; no additional frameworks or runtime services.
- UX flow is paste → auto-format → print/save PDF.
- Initial release targets English lyrics and chord naming.
- Built-in transposition is a planned enhancement.

## Module boundaries
- `tokenizer`
  - Input: raw line. Output: tokens (word, symbol). Pure.
- `chord-grammar`
  - Defines chord token regex and normalization rules.
- `normalizer`
  - Maps Unicode sharps/flats, trims, collapses spaces, standardizes chord spellings.
- `classifier`
  - Inputs: tokens per line; Outputs: `Chord|Lyric|Blank` with score. Uses ratio and grammar hits. Threshold configurable.
- `segmenter`
  - Groups lines into blocks by blank lines and heuristic headers. Pure.
- `formatter`
  - Transforms blocks to renderable rows; applies visibility flags (future per-block toggles). Pure.
- `app`
  - State machine: `{input, blocks, uiSettings, printMode}`; invokes core; debounced.
- `ui`
  - Render functions + print CSS; no business logic.
- `platform`
  - Clipboard paste, file open, print trigger.


## Algorithms
- Chord token regex: define once in `chord-grammar`. Allow roots A–G, accidentals `#|b|♯|♭`, suffixes `m|min|maj|dim|aug|sus(2|4)|add(9|11|13)|6|7|9|11|13`, optional slash bass.
- Line classification score = `(validChordTokens / consideredTokens)` with penalties for alphabetic words `>3` letters. Threshold default 0.6.
- Post-processing merges chord stubs and collapses repeated spaces while preserving `white-space: pre`.

## Error handling
- Invalid lines default to `Lyric` with low confidence; never crash.

## Printing and layout
- CSS columns; `break-inside: avoid` on blocks; monospace for chord rows; `@page` for A4.

## Extensibility points
- Replace grammar via config.
- Add transposition by inserting a `transpose(rootDelta)` step before `formatter`.
- Per-block toggles live in `Block.meta` without changing core types.

## ADR references
- ADR-0001 Choose CSS columns + browser print over PDF library.
- ADR-0002 Pure-core vs UI separation.

## Separation of concerns principles
- Pure-core modules accept and return plain data; no DOM, no timers, no globals.
- UI reads state, renders DOM; zero business rules.
- `app` is the only place where user events trigger core execution.
- All thresholds and grammar live in a config object passed into core; tests can override it.

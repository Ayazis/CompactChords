# TODO

1. Align tokenizer and chord-grammar
   - Extract the canonical chord regex into `chord-grammar` and ensure tokenizer references it.
   - Verify tokenizer emits tokens compatible with normalizer/classifier expectations.
   - Add regression tests for roots A–G, accidentals (`#`, `b`, `♯`, `♭`), and suffixes (e.g., `maj7`, `sus4`, `add9`).

2. Implement normalizer pipeline
   - Map Unicode sharps/flats to ASCII, trim/collapse spaces, and standardize chord spellings.
   - Document transformation ordering for future contributors.
   - Add tests covering mixed whitespace, Unicode inputs, and split chord stubs.

3. Build classifier scoring
   - Implement score formula `(validChordTokens / consideredTokens)` with penalties for alphabetic words >3 letters.
   - Expose configurable threshold (default 0.6) through a shared config object.
   - Ensure low-confidence lines fall back to `Lyric` with no exceptions.

4. Flesh out segmenter heuristics
   - Group lines into blocks via blank lines and header detection.
   - Keep module pure and cover song edge cases through tests.

5. Complete formatter rules
   - Convert segments into renderable rows and respect future per-block visibility flags.
   - Preserve spacing for printing while collapsing redundant spaces only where safe.

6. App state machine (native JS)
   - Manage `{input, blocks, uiSettings, printMode}` and debounce core invocation.
   - Route thresholds/grammar config into pure modules.
   - Keep implementation in native JavaScript with zero external runtime dependencies.

7. UI shell and styles
   - Keep render functions and print CSS separate from business logic.
   - Implement monospace chord rows, CSS columns, `break-inside: avoid`, and A4 `@page`.

8. Platform hooks (paste-first UX)
   - Implement clipboard paste, file open, and print triggers as thin wrappers around app state transitions.
   - Ensure the default flow covers paste → format → print/save PDF with minimal UI friction.

9. Extensibility hooks
   - Allow swapping chord grammar via config and add a `transpose(rootDelta)` hook before formatter.
   - Store per-block toggles in `Block.meta` for future features.
   - Leave hooks for future transposition UI even if the core is ready earlier.

10. Error handling/tests
    - Confirm invalid inputs default to `Lyric` with low confidence.
    - Add tests proving every module handles malformed input gracefully.

11. ADR follow-through
    - Reference ADR-0001/0002 when implementing the CSS column print strategy and pure-core separation.
    - Update documentation if implementation deviates from recorded decisions.

# Test Strategy

## Levels
- Unit (core modules): deterministic, property-based where useful.
- Integration (app state → DOM snapshot): fixtures render, print CSS presence.
- App (`tests/app`): the real `src/app/main.ts` booted against `index.html` in jsdom and driven like a user (open, edit, save, delete, transpose, capo, sections, fit to page, backup/restore, bookmarklet and link import, shortcuts, drawers).
- Sheet options (`tests/app/features`): chord colour, section spacing, header/footer and light/dark theme, including saving and print behaviour.
- Server/platform (`tests/integration/server`, `platform`): the dev-server endpoints, the fetch allow-list, pre-computed cache, and the browser-side helpers.
- Print (`tests/print`): the app on the Vite dev server in Chromium, printed to PDF; checks the printed columns match the preview, no empty trailing page, and every page of a long song uses both columns. Text positions are read from the PDF (`tests/print/pdf.ts`).

## Property tests
- Random insertions of spaces and `(x2)` markers keep classification invariant.
- Unicode sharp/flat normalization idempotent.

## Fixtures
- `fixtures/beatles-01.txt`, `fixtures/hymn-01.txt`, `fixtures/pop-01.txt` with ground-truth annotations.

## Coverage goals
- Core modules ≥95% line/branch.

## Deterministic seeds
- Fix random seeds for property tests.

## Performance checks
- Time classification on large fixture; assert threshold.

## Traceability
- Traceability to AC and FR/NFR.

## Unit testability hooks
- Export pure functions for `tokenizer`, `normalizer`, `classifier`, `segmenter`, `formatter`.
- Provide deterministic `now()` and `uuid()` injectables for IDs.
- Keep fixtures as plain text with expected labeled outputs stored as JSON alongside.

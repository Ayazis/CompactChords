# Requirements

## Functional requirements (FR)
- FR-01 Paste or type text into the editor.
- FR-02 Auto classify each line as `Chord`, `Lyric`, `Blank`, `Header` or `Tab`.
- FR-03 Render an A4 preview in 1, 2 or 3 columns (2 by default).
- FR-04 Independent chord and lyric font-size controls.
- FR-05 Print uses the browser dialog with fixed A4 margins and shows only the sheet.
- FR-06 A built-in example song is always available. With the local server, links in `urls/*.txt` are listed too.
- FR-07 Import from a tab site: with the "Send to CompactChords" bookmarklet on any static host, or by link through the local server (ADR-0003, ADR-0004).
- FR-08 Save the open song with its settings (sizes, columns, tablature, transposition, capo, accidentals, section toggles) to a library in the browser, and reopen it with those settings restored. Songs can be removed from the library.
- FR-09 Transpose ±11 semitones. Lyrics are untouched and chords keep their positions above the lyrics.
- FR-10 Capo: chords are shown as shapes relative to the capo fret.
- FR-11 Accidentals: automatic (from the key), sharps or flats.
- FR-12 Detect and show the key: original, sounding (after transposing) and shapes (with a capo).
- FR-13 Hide a section, or only its chords (formerly FR-N1 and FR-N2).
- FR-14 "Fit to one page": the largest text size that fits on one A4 page, preferring sizes where no lyric line wraps.
- FR-15 Export the library to a JSON file and import it again (merged by song id).
- FR-16 Warn before discarding unsaved changes (switching songs, closing the tab).
- FR-17 Keyboard shortcuts: Ctrl+S save, Ctrl+E editor, Alt+↑/↓ transpose, / search.

## Quality attributes (NFR)
- NFR-01 Deterministic parsing; no network access in the core.
- NFR-02 Pure-core functions free of DOM for unit testing.
- NFR-03 Layout stable under `@media print`.
- NFR-04 Accessibility: keyboard usable; no color-only cues (chords are also bold and monospace).
- NFR-05 Performance: classify 1000 lines < 150 ms on baseline hardware.
- NFR-06 Works as static files from any path (relative asset URLs); every feature except link import works without a server.
- NFR-07 Usable from 375 px wide: panels become drawers and the preview scales to fit.

## Constraints
- Static site; no backend. The local server is an optional development aid.
- Modern evergreen browsers (CSS `:has()` and container query units).

## Acceptance criteria
- AC-01 Given mixed chord/lyric fixture, classifier achieves ≥90% precision and ≥90% recall.
- AC-02 Adjusting chord size does not alter lyric size and vice versa.
- AC-03 Printing hides controls and preserves column flow without orphaned headers.
- AC-04 Default margins ≤15 mm; column gap 12±2 mm.
- AC-05 Transposing by n and back by n restores every chord root; a capo equal to the transposition shows the original shapes.

## Traceability matrix
- FR-02 → Unit: classifier.test, chord-grammar.test; Property: random chord noise; Integration: end-to-end fixture render.
- FR-03, FR-05 → Integration: render.test (columns, print CSS).
- FR-07 → Unit: tab-site.test; Integration: bookmarklet.test, saved-songs.test.
- FR-08, FR-15 → Unit: songs.test (settings validation, library file, merge).
- FR-09 to FR-13 → Unit: transpose.test (transposition, keys, arrange), segmenter-formatter.test (hidden sections).

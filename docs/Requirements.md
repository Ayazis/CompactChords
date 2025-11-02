# Requirements

## Functional requirements (FR)
- FR-01 Paste text into input area.
- FR-02 Auto classify each line as `Chord`, `Lyric`, or `Blank`.
- FR-03 Render two-column A4 layout in preview.
- FR-04 Independent chord and lyric font-size controls.
- FR-05 Print uses browser dialog with fixed A4 margins and hides controls.
- FR-06 Load example fixture for quick verification.
- FR-N1 Remove sections (post-MVP).
- FR-N2 Toggle chord visibility per block (post-MVP).

## Quality attributes (NFR)
- NFR-01 Deterministic parsing; no network access.
- NFR-02 Pure-core functions free of DOM for unit testing.
- NFR-03 Layout stable under `@media print`.
- NFR-04 Accessibility: keyboard usable; no color-only cues.
- NFR-05 Performance: classify 1000 lines < 150 ms on baseline hardware.

## Constraints
- Static site; no backend.
- Modern evergreen browsers.

## Acceptance criteria
- AC-01 Given mixed chord/lyric fixture, classifier achieves ≥90% precision and ≥90% recall.
- AC-02 Adjusting chord size does not alter lyric size and vice versa.
- AC-03 Printing hides controls and preserves two-column flow without orphaned headers.
- AC-04 Default margins ≤15 mm; column gap 12±2 mm.

## Traceability matrix
- FR-02 → Unit: classifier.spec, Property: random chord noise; Integration: end-to-end fixture render.
- FR-03 → Integration: print-preview CSS test; Visual: screenshot diff.

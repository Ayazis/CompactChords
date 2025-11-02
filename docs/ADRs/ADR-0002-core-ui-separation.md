# ADR-0002: Pure Core with Thin UI Shell

## Context
We must ship a deterministic chord-sheet classifier and formatter that can be unit tested without a browser. Requirements call for ≥90% precision/recall, deterministic parsing, and fast feedback. UI concerns (DOM manipulation, styling, browser events) rapidly introduce side effects that complicate testing and make it harder to keep the core pure. We also anticipate future features such as transposition and per-block toggles, which should be addable without rewriting rendering code.

## Decision
Structure the application as a pure-core pipeline plus a thin UI shell:
- Implement tokenizer, normalizer, chord grammar, classifier, segmenter, and formatter as pure TypeScript modules with no DOM or global state.
- Keep thresholds, normalization rules, and ID generators injected as data/config objects.
- Reserve all DOM interaction, event handling, and print mode toggles for the UI layer (`app` + `ui` + `platform` modules).
- Ensure core modules export plain data structures (`Line`, `Block`, `Document`) so tests can exercise them directly.

## Consequences
- ✅ Core remains fully unit-testable with deterministic inputs and outputs, satisfying NFR-01/02 and coverage goals.
- ✅ Future features (e.g., transposition, per-block chord visibility) can hook into the pipeline without leaking UI details.
- ✅ Browser-only concerns (print CSS, keyboard handling) stay isolated, simplifying debugging and making integration tests targeted.
- ⚠️ Requires disciplined API boundaries; any new feature must respect the separation to avoid regression.

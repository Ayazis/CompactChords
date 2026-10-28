# ADR-0004: Static-first library and import

## Context
CompactChords is meant to be hosted as static files (for example on GitHub Pages). Saving songs and importing from Ultimate Guitar first depended on the local Vite server (ADR-0003), so neither worked from a static deploy.

## Decision
- **Library in the browser.** Saved songs live in `localStorage` (key `compact-chords.library.v1`) as `StoredSong` records: text, title, details, source link and all sheet settings. `src/platform/library.ts` reads and writes them. Every record is checked with `parseStoredSong` when read, so corrupt or older data is skipped or upgraded with default settings instead of breaking the app.
- **Export/import as the sync story.** The library exports to a JSON file (`format: "compact-chords-library"`, `version: 1`) and imports from one, merging by song id. This covers backups and moving between devices without a backend.
- **Bookmarklet for Ultimate Guitar.** "Send to CompactChords" (`src/platform/bookmarklet.ts`) runs on the Ultimate Guitar page itself, where the chord data is already loaded. It opens the app with the sheet in the URL fragment (`#import=…`). Fragments are never sent to a server, so this works from any static host. The app treats the payload as untrusted and checks it with `sheetFromShared` before use.
- **Relative asset paths** (`base: './'` in Vite) so `dist/` works from any folder or sub-path.
- **The local server becomes optional.** Link import and the `urls/*.txt` lists remain dev-only conveniences, and the UI hides them when `/api/lists` is unavailable.

## Consequences
- A library is per browser and per origin. Clearing site data deletes it, which the UI points out next to the export button.
- `localStorage` holds a few MB, roughly hundreds of songs; saving reports a clear error when it is full.
- The bookmarklet depends on Ultimate Guitar's page structure, the same as the server importer, and both use the same field names.
- Songs saved on the dev server's origin (`localhost:5173`) are not visible on a deployed site; export and import them to move them.

# ADR-0003: Import chord sheets from Ultimate Guitar URLs

## Context
Users want to point the app at an Ultimate Guitar tab page instead of copying text by hand. Browsers cannot fetch those pages directly (no CORS headers), and the app is a static site with no backend.

## Decision
- A pure importer, `src/core/importers/ultimate-guitar.ts`, reads the chord sheet from the JSON that the page embeds in `.js-store[data-content]`. It returns the text with `[ch]`/`[tab]` markup removed, plus song title, artist, capo and any non-standard tuning.
- A Vite plugin (`server/import-plugin.ts`) serves `GET /api/import?url=…` during `npm run dev` and `npm run preview`. It fetches the page server-side and returns only the extracted sheet.
- The endpoint accepts only `https://` URLs on `ultimate-guitar.com` hosts, and checks the final URL after redirects, so it cannot be used as an open proxy.
- The same plugin serves `GET /api/lists`, which lists the Ultimate Guitar links in `urls/*.txt` (one per line, grouped by file name) for the library panel.
- `npm run precompute` (`scripts/precompute.ts`) fetches every saved link once and writes the parsed sheet to `urls/cache/<artist>__<song>.json`. It skips links that are already cached unless run with `-- --force`, and removes cache files for links that are no longer saved. `/api/import` serves cached sheets without any network request and fetches live only for links that are not cached.
- `urls/cache/` is git-ignored: the cached sheets contain copyrighted lyrics, so only the links are committed and every clone runs `npm run precompute` itself.
- The core stays network-free (NFR-01): the importer works on an HTML string, and the platform layer does the fetching.

## Consequences
- Link import works only while the local Vite server is running. On static hosting, the bookmarklet from ADR-0004 does the same job.
- The importer depends on Ultimate Guitar's page structure. If that changes, import fails with a clear error and paste keeps working.
- Pro and Official tabs have no text sheet and are reported as unsupported.
- Imported content is copyrighted. It is shown to the user and never stored in the repository, and test fixtures are original material.

## Superseded parts
- Saving songs as files in `urls/saved/` through `/api/song` was replaced by the browser library (ADR-0004), so saving also works on static hosting.

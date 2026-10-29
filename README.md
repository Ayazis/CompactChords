# CompactChords

Turns chord sheets into compact, print-ready A4 pages. Transpose, set a capo, hide sections, fit a song on one page, and keep your versions in a library, all in the browser.

## Use it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

- **Get a song in:** pick one from the library, paste into the editor (**Edit text**), or send one from the supported tab site with the **Send to CompactChords** bookmarklet (under *Import & backup*; drag it to your bookmarks bar).
- **Shape it:** transpose, capo, sharps/flats, 1–3 columns, chord and lyric sizes, chord colour, space between sections, a header and footer (`{date}` becomes today's date), **Fit to one page**, and per-section *Show* / *Chords* toggles.
- **Keep it:** **Save** stores the song with all its settings in this browser. **Export** the library to back it up or move it to another device; **Import file** to restore.
- **Theme:** Auto / Light / Dark under *Appearance* (applies to the app, the text editor and the preview; printing is always on white).
- **Print:** **Print** (or Ctrl+P) prints just the sheet on A4.

Shortcuts: Ctrl+S save · Ctrl+E editor · Alt+↑/↓ transpose · / search.

## Deploy as a static site

```bash
npm run build
```

Upload `dist/` anywhere (GitHub Pages, Netlify, a folder on a web server). Asset paths are relative, so sub-paths work. Everything works without a server except importing by pasting a link; use the bookmarklet instead.

## Development extras (local server only)

- Paste a tab-site link into *Import & backup* to import it.
- Put links in `urls/*.txt` (one per line) to list them in the library. `npm run precompute` fetches them once into `urls/cache/` (git-ignored, as it contains lyrics).
- `npm run make-fixtures` turns those cached sheets into lyric-free test fixtures in `tests/fixtures/sheets/` (see the README there).

## Tests

```bash
npx playwright install chromium   # once: the print layout tests print to PDF in Chromium
npm test
npm run typecheck
```

Design notes live in [docs/](docs/): requirements, architecture and the ADRs.

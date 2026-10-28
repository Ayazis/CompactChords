# CompactChords

Turns chord sheets into compact, print-ready A4 pages. Transpose, set a capo, hide sections, fit a song on one page, and keep your versions in a library, all in the browser.

## Use it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

- **Get a song in:** pick one from the library, paste into the editor (**Edit text**), or send one from Ultimate Guitar with the **Send to CompactChords** bookmarklet (under *Import & backup*; drag it to your bookmarks bar).
- **Shape it:** transpose, capo, sharps/flats, 1–3 columns, chord and lyric sizes, **Fit to one page**, and per-section *Show* / *Chords* toggles.
- **Keep it:** **Save** stores the song with all its settings in this browser. **Export** the library to back it up or move it to another device; **Import file** to restore.
- **Print:** **Print** (or Ctrl+P) prints just the sheet on A4.

Shortcuts: Ctrl+S save · Ctrl+E editor · Alt+↑/↓ transpose · / search.

## Deploy as a static site

```bash
npm run build
```

Upload `dist/` anywhere (GitHub Pages, Netlify, a folder on a web server). Asset paths are relative, so sub-paths work. Everything works without a server except importing by pasting a link; use the bookmarklet instead.

## Development extras (local server only)

- Paste an Ultimate Guitar link into *Import & backup* to import it.
- Put links in `urls/*.txt` (one per line) to list them in the library. `npm run precompute` fetches them once into `urls/cache/` (git-ignored, as it contains lyrics).

### Getting your saved links onto the deployed site

The deployed site has no server, so it cannot read `urls/`. `npm run precompute` also writes `urls/cache/library.json`. Open the deployed site, go to **Import & backup → Import file** and pick that file: all pre-computed songs land in that browser's library. The lyrics stay in your browser and are never published with the site.

## Tests

```bash
npm test
npm run typecheck
```

Design notes live in [docs/](docs/): requirements, architecture and the ADRs.

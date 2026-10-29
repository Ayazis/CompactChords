# CompactChords

Turns chord sheets into compact, print-ready A4 pages. Transpose, set a capo, hide sections, fit a song on one page, and keep your versions in a library, all in the browser.

## Use it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

- **Get a song in:** pick one from the library, paste into the editor (**Edit text**), or send one from a Chrome tab with the **Send to CompactChords** bookmarklet ([see below](#send-a-song-from-a-chrome-tab)).
- **Shape it:** transpose, capo, sharps/flats, 1–3 columns, chord and lyric sizes, chord colour, space between sections, a header and footer (`{date}` becomes today's date), **Fit to one page**, and per-section *Show* / *Chords* toggles.
- **Keep it:** **Save** stores the song with all its settings in this browser. **Export** the library to back it up or move it to another device; **Import file** to restore.
- **Theme:** Auto / Light / Dark under *Appearance* (applies to the app, the text editor and the preview; printing is always on white).
- **Print:** **Print** (or Ctrl+P) prints just the sheet on A4.

Shortcuts: Ctrl+S save · Ctrl+E editor · Alt+↑/↓ transpose · / search.

## Send a song from a Chrome tab

The **Send to CompactChords** bookmarklet takes the chord sheet from a tab-site page open in Chrome and opens it in CompactChords in a new tab. You set it up once.

**Set it up**

1. Open CompactChords at the address you'll keep using, for example the hosted version at https://ayazis.github.io/CompactChords/. The bookmarklet always sends songs to the address you dragged it from, so if you drag it from `localhost` it only works while `npm run dev` is running.
2. Show Chrome's bookmarks bar: **Ctrl+Shift+B** (**Cmd+Shift+B** on a Mac), or ⋮ → *Bookmarks and lists* → *Show bookmarks bar*.
3. In CompactChords, open *Import & backup* in the sidebar and drag **♫ Send to CompactChords** onto the bookmarks bar. (Clicking it in the app only shows a reminder to drag it.)

**Use it**

1. Open a song's chord page on the tab site in Chrome.
2. Click **♫ Send to CompactChords** on the bookmarks bar.
3. A new tab opens with the song loaded, including its title, artist, capo and tuning. Click **Save** to keep it in your library.

**If it doesn't work**

- *"no chord sheet found on this page"*: you're not on a chord sheet page, or it's a Pro or Official tab, which has no text sheet. Copy the text and paste it into the editor instead.
- *Nothing happens or the tab is blocked*: Chrome may block the pop-up. Allow pop-ups for the tab site, or the bookmarklet opens the app in the same tab instead.
- *Want it on another device or browser*: drag the bookmarklet there again; bookmarks synced by Chrome work too.

The song travels in the link's `#` fragment, which the browser never sends to a server, so this works on a static host with no backend.

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

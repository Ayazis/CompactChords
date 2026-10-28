# Feature

## Purpose
The application condenses verbose chord sheets into compact, print-ready A4 layouts so musicians can quickly produce a tidy sheet with clearly distinguished chords and lyrics, in the key and capo position they play in.

## User stories
- As a guitarist, I paste a chord sheet and get an A4 print preview with chords recognized and sized separately from lyrics.
- As a user, I can tune chord and lyric font sizes independently, choose 1–3 columns, or let the app fit the song on one page.
- As a singer, I transpose a song to my key; as a guitarist, I set a capo and see the shapes to play.
- As a band member, I hide sections we skip, or the chords of sections I know by heart.
- As a user, I send a song from Ultimate Guitar to the app with one click, and keep my versions in a library I can back up.

## Out of scope
Authentication; cloud sync (export/import covers moving between devices); chord diagrams; PDF engine beyond browser print.

## UX flow
1. Pick a song from the library, send one from Ultimate Guitar, or paste one into the editor
2. Auto classify and render the preview
3. Transpose, set capo, adjust layout and sections
4. Save to the library
5. Print

## Non-goals
Collaborative features; editing chords inside the preview (the text editor is the source of truth).

## Success metrics
- ≥90% precision on chord-line detection across provided fixtures.
- One A4 page at default sizes for reference fixture.
- Render time < 50 ms for ≤500 lines on mid-tier laptop.

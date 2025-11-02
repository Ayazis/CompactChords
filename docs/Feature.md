# Feature

## Purpose
The application condenses verbose chord sheets into compact, print-ready layouts so musicians can quickly produce a tidy two-column A4 preview with clearly distinguished chords and lyrics.

## User stories
- As a guitarist, I paste a chord sheet and get a two-column A4 print preview with chords recognized and sized separately from lyrics.
- As a user, I can tune chord and lyric font sizes independently.
- Next steps (non-MVP): remove sections; per-section chord visibility.

## Out of scope (MVP)
Import/export formats beyond paste; transposition; persistence; authentication; cloud saves.

## UX flow (MVP)
1. Paste
2. Auto classify
3. Two-column render
4. Adjust sizes
5. Print

## Non-goals
Editing chords, collaborative features, PDF engine beyond browser print.

## Success metrics
- ≥90% precision on chord-line detection across provided fixtures.
- One A4 page at default sizes for reference fixture.
- Render time < 50 ms for ≤500 lines on mid-tier laptop.

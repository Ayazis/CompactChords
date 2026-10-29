# Real chord sheets

Test data with the shape of real tab-site sheets: section headers, blank lines
inside sections, tablature, repeat markers and chord spacing.

- `public-domain__*.txt`: songs whose words and music are in the public domain,
  written out for these tests.
- Every other file comes from a song in `urls/*.txt` with its lyrics replaced by
  filler of the same length (`npm run precompute`, then `npm run make-fixtures`).
  Chords, headers and tablature stay as they were, so each line classifies the
  same as in the original. Lyrics are copyrighted and must not be committed.

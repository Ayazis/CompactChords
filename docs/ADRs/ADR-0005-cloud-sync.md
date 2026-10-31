# ADR-0005: Optional Google sign-in and cloud library

## Context
The library lives in one browser (ADR-0004); export and import move it by hand. A handful of people want the same library on their phone and laptop, signing in with an account they already have, without anyone running or paying for a server.

## Decision
- **Firebase, called from the browser.** Firebase Authentication (Google provider only) and Firestore (Lite SDK) on the free plan. The site stays static files; the Firebase SDK (≈53 KB gzipped) is a separate chunk that only downloads when `src/platform/cloud-config.ts` has a config. Without one the app is unchanged.
- **The browser library stays the working copy.** The app reads and writes `localStorage` as before; nothing waits on the network. `src/platform/cloud.ts` defines a small `Cloud` interface (user changes, sign in/out, pull, push) and `src/platform/firebase.ts` implements it.
- **Data model.** One document per song at `users/{uid}/songs/{songId}`, holding the `StoredSong` as is. `firestore.rules` lets a signed-in user read and write only their own documents and checks their shape. An optional e-mail allowlist in the rules limits who may use it.
- **Sync.** On sign-in, when the app opens with a remembered session, after importing a file, and on **Sync now**, the app pulls every record and merges with `reconcile` (`src/core/sync.ts`, pure): per song id the newest `savedAt` wins and the loser is overwritten; what the cloud lacks or has older is uploaded. Each Save or Delete is also pushed immediately; if that fails, the next sync sends it.
- **Deletions are records.** Deleting writes a tombstone `{id, deleted: true, savedAt}` to the cloud, so other devices remove the song instead of uploading it again. Deletions made while offline or signed out are kept in `compact-chords.deleted.v1` until the cloud has them. Saving or importing a song drops its local tombstone.
- **One account per browser library.** `compact-chords.cloud-owner` remembers whose cloud library this browser last synced with. When a different account signs in and the browser has songs, the app asks before merging them into that account. Signing out offers to clear the browser library (shared computers).
- **Sign-in with a popup**, not a redirect: redirects break on browsers that block third-party storage when the site is not on the Firebase auth domain.

## Consequences
- Conflicts are resolved by last save wins, per song, using each device's clock. Good enough for one person on a few devices; two people never share a library.
- Changes made on another device appear on the next open or **Sync now**, not live; a full pull reads every song, which the free quota covers for a handful of users with hundreds of songs.
- A library file imported into a browser keeps its `savedAt`, so a song deleted in the cloud after that backup was made stays deleted.
- Tombstones stay in the cloud. They are tiny; a song saved again with the same id replaces its tombstone.
- The app now has an external dependency when configured: if Firebase is unreachable, sign-in and sync fail with a message and everything else keeps working.
- Tests use an in-memory `FakeCloud` (tests/app/harness.ts); the Firebase adapter itself is only smoke-tested in a browser.

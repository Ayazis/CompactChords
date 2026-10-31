# Cloud sync: sign in with Google

CompactChords can keep each person's library in the cloud, so it follows them to every device they sign in on. It uses Firebase (Google's free app backend): Authentication for **Sign in with Google**, Firestore for the songs. The free plan covers a handful of people with room to spare: 1 GiB of storage, 50,000 reads and 20,000 writes a day, and a song is a few KB.

Until it is set up, the app works as before: no sign-in button, library in the browser only. How it works is in [ADR-0005](ADRs/ADR-0005-cloud-sync.md).

## Set it up (about 10 minutes)

1. **Create a project.** Go to <https://console.firebase.google.com>, click **Create a project**, give it a name (e.g. `compactchords`). Google Analytics is not needed.
2. **Turn on Google sign-in.** *Build → Authentication → Get started → Sign-in method → Google → Enable*, pick a support email, **Save**.
3. **Allow the site's address.** *Authentication → Settings → Authorized domains → Add domain*: `ayazis.github.io` (this covers the PR previews too). `localhost` is already there for `npm run dev`.
4. **Create the database.** *Build → Firestore Database → Create database*, pick a location near you, start in **production mode**.
5. **Set the security rules.** *Firestore Database → Rules*: replace the contents with [`firestore.rules`](../firestore.rules) from this repository and click **Publish**. They let each person read and write only their own songs.
6. **Register the web app.** *Project settings* (gear icon) *→ General → Your apps → Web* (`</>`), give it a nickname, skip Firebase Hosting, **Register app**. Copy the `firebaseConfig` values it shows.
7. **Paste the config** into [`src/platform/cloud-config.ts`](../src/platform/cloud-config.ts) (`apiKey`, `authDomain`, `projectId`, `appId`; the other fields are not needed) and push to `main`.

The config values are not secrets: every Firebase web app ships them to the browser. The security rules decide who may read and write what.

## Only a handful of people

As delivered, anyone with a Google account who finds the site can sign in and keep their own songs (they can never see anyone else's). To limit it to people you choose, edit `allowed()` in `firestore.rules` and publish again:

```
function allowed() {
  return request.auth.token.email in ['you@gmail.com', 'friend@gmail.com'];
}
```

Someone not on the list can still sign in, but syncing then fails with "The cloud refused access for this account." Their songs stay in their browser as before.

## Using it

- **Sign in with Google** is under the song list. Signing in the first time uploads the songs already in that browser; on another device it downloads them.
- Every **Save** and **Delete** goes to the cloud straight away. Other devices pick changes up when the app opens, or with **Sync now**.
- If the same song was changed on two devices, the most recent save wins.
- Without a connection, saving still works in the browser; the next sync uploads it.
- **Sign out** asks whether to remove the songs from that browser too (use that on a shared computer); they stay in the account either way.
- **Export** still makes a backup file of the library.

## Troubleshooting

| Message | Fix |
| --- | --- |
| Sign-in is not allowed on this address | Add the site's domain under *Authentication → Settings → Authorized domains*. |
| Google sign-in is not set up for this site yet | Check step 2 (Google enabled) and step 7 (config pasted correctly). |
| The browser blocked the sign-in window | Allow pop-ups for the site. |
| The cloud refused access for this account | The rules were not published (step 5), or the account is not in `allowed()`. |
| The cloud is over its free daily limit | Wait until the quota resets (midnight Pacific time). |

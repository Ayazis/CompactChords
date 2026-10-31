// Firebase project for signing in with Google and keeping the library in the
// cloud (ADR-0005). Leave it undefined and the app works as before: no sign-in
// button, library in the browser only.
//
// To turn it on, follow docs/Cloud-sync.md and paste the web app config from
// the Firebase console (Project settings → Your apps → SDK setup and
// configuration → Config). These values are public by design: they name the
// project, and firestore.rules decides who may read or write what.

import type { CloudConfig } from './cloud';

export const CLOUD_CONFIG: CloudConfig | undefined = undefined;
// Example:
// export const CLOUD_CONFIG: CloudConfig | undefined = {
//   apiKey: 'AIza…',
//   authDomain: 'your-project.firebaseapp.com',
//   projectId: 'your-project',
//   appId: '1:123…:web:abc…',
// };

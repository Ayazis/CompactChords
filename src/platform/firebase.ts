// Firebase implementation of Cloud: Google sign-in and one Firestore document
// per song at users/{uid}/songs/{songId}. Loaded on demand by cloud.ts.
// Firestore Lite keeps the download small; the browser library already does
// the offline work.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth } from 'firebase/auth';
import { collection, doc, getDocs, initializeFirestore, writeBatch, type Firestore } from 'firebase/firestore/lite';
import { parseCloudRecord, type CloudRecord } from '../core/sync';
import type { Cloud, CloudConfig, CloudUser } from './cloud';

/** Firestore allows 500 writes per batch. */
const BATCH_SIZE = 400;

export function firebaseCloud(config: CloudConfig): Cloud {
  const app = initializeApp(config);
  const auth: Auth = getAuth(app);
  const db: Firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });

  const songs = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in first.');
    return collection(db, 'users', uid, 'songs');
  };

  return {
    onUserChange(listener) {
      onAuthStateChanged(auth, (user) => {
        const signedIn: CloudUser | undefined = user
          ? { uid: user.uid, name: user.displayName ?? '', email: user.email ?? '' }
          : undefined;
        listener(signedIn);
      });
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    },
    async signOut() {
      await signOut(auth);
    },
    async pull() {
      const snapshot = await getDocs(songs());
      return snapshot.docs
        .map((item) => parseCloudRecord(item.data()))
        .filter((record): record is CloudRecord => record !== undefined);
    },
    async push(records) {
      const target = songs();
      for (let start = 0; start < records.length; start += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const record of records.slice(start, start + BATCH_SIZE)) batch.set(doc(target, record.id), record);
        await batch.commit();
      }
    },
  };
}

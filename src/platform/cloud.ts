// Optional sign-in and cloud copy of the library (ADR-0005). The browser
// library stays the working copy; the cloud is merged into it on sign-in, on
// start and on "Sync now", and every save or delete is sent straight up.
//
// The Firebase SDK is only downloaded when CLOUD_CONFIG is set.

import type { CloudRecord } from '../core/sync';
import { CLOUD_CONFIG } from './cloud-config';

/** The Firebase web app config fields the app needs. */
export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
}

export interface Cloud {
  /** Called with the signed-in user (or undefined) now and whenever it changes. */
  onUserChange(listener: (user: CloudUser | undefined) => void): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Every record of the signed-in user. */
  pull(): Promise<CloudRecord[]>;
  /** Writes records (songs or deletions) of the signed-in user. */
  push(records: CloudRecord[]): Promise<void>;
}

/** Connects to the configured cloud, or returns undefined when there is none. */
export async function connectCloud(config: CloudConfig | undefined = CLOUD_CONFIG): Promise<Cloud | undefined> {
  if (!config) return undefined;
  const { firebaseCloud } = await import('./firebase');
  return firebaseCloud(config);
}

/** Turns SDK errors into messages for the status line. */
export function cloudErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in cancelled.';
    case 'auth/popup-blocked':
      return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'Sign-in is not allowed on this address. Add it under Authentication → Settings → Authorized domains.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not set up for this site yet (see docs/Cloud-sync.md).';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Could not reach the cloud. Check your connection; your songs are still saved in this browser.';
    case 'permission-denied':
      return 'The cloud refused access for this account.';
    case 'resource-exhausted':
      return 'The cloud is over its free daily limit. Your songs are saved in this browser; try again tomorrow.';
    default:
      return `Cloud sync failed${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
  }
}

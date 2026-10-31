/** @jest-environment jsdom */
// Signing in with Google and keeping the library in sync, against a fake cloud.
import { DEFAULT_SHEET_SETTINGS, type StoredSong } from '../../src/core/songs';
import type { CloudRecord } from '../../src/core/sync';
import { bootApp, disposeApp, FakeCloud, type App } from './harness';

const LIBRARY_KEY = 'compact-chords.library.v1';
const DELETED_KEY = 'compact-chords.deleted.v1';
const OWNER_KEY = 'compact-chords.cloud-owner';
const ADA = { uid: 'u1', name: 'Ada', email: 'ada@example.com' };
const BOB = { uid: 'u2', name: 'Bob', email: 'bob@example.com' };

const song = (id: string, title: string, savedAt = '2026-01-01T00:00:00.000Z', text = 'G  D\nHello world'): StoredSong => ({
  id,
  title,
  details: '',
  text,
  settings: structuredClone(DEFAULT_SHEET_SETTINGS),
  savedAt,
});
const library = (...songs: StoredSong[]) => ({ [LIBRARY_KEY]: JSON.stringify(songs) });
const titles = (app: App) => app.$$('#song-list .song-label').map((node) => node.textContent);
const ids = (records: CloudRecord[]) => records.map((record) => record.id).sort();

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterEach(() => {
  disposeApp();
  jest.useRealTimers();
});

describe('account panel', () => {
  it('stays hidden when no cloud is configured', async () => {
    const app = await bootApp();
    expect(app.$('#account').hidden).toBe(true);
  });

  it('offers Google sign-in when a cloud is configured', async () => {
    const app = await bootApp({ cloud: new FakeCloud() });
    expect(app.$('#account').hidden).toBe(false);
    expect(app.$('#signed-out').hidden).toBe(false);
    expect(app.$('#signed-in').hidden).toBe(true);
    expect(app.$('#sign-in').textContent).toContain('Sign in with Google');
    expect(app.$('#library-hint').textContent).toContain('stored in this browser.');
  });
});

describe('signing in', () => {
  it('merges the browser library with the account and reports it', async () => {
    const cloud = new FakeCloud({ records: { u1: [song('my__cloud', 'From the cloud')] } });
    const app = await bootApp({ cloud, storage: library(song('my__local', 'Saved here')) });
    await app.click('#sign-in');

    expect(app.$('#signed-in').hidden).toBe(false);
    expect(app.$('#account-name').textContent).toBe('ada@example.com');
    expect(app.$('#library-hint').textContent).toContain('and in your account');
    expect(titles(app)).toEqual(['From the cloud', 'Saved here', 'Paper Lanterns']);
    expect(ids(cloud.stored())).toEqual(['my__cloud', 'my__local']);
    expect(app.status()).toBe('Signed in as ada@example.com. Library synced: 1 song from the cloud, 1 uploaded.');
    expect(localStorage.getItem(OWNER_KEY)).toBe('u1');
  });

  it('says so when everything was already in sync', async () => {
    const cloud = new FakeCloud({ records: { u1: [song('my__a', 'Alpha')] } });
    const app = await bootApp({ cloud, storage: library(song('my__a', 'Alpha')) });
    await app.click('#sign-in');
    expect(app.status()).toBe('Signed in as ada@example.com. Library synced: everything was up to date.');
    expect(cloud.pushes).toEqual([]);
  });

  it('reports a cancelled or blocked sign-in', async () => {
    const cloud = new FakeCloud();
    const app = await bootApp({ cloud });
    cloud.failures.signIn = { code: 'auth/popup-closed-by-user' };
    await app.click('#sign-in');
    expect(app.status()).toBe('Sign-in cancelled.');
    expect(app.$('#signed-in').hidden).toBe(true);
    expect(app.$<HTMLButtonElement>('#sign-in').disabled).toBe(false);

    cloud.failures.signIn = { code: 'auth/popup-blocked' };
    await app.click('#sign-in');
    expect(app.status()).toContain('blocked the sign-in window');

    cloud.failures.signIn = { code: 'auth/configuration-not-found' };
    await app.click('#sign-in');
    expect(app.status()).toBe('Google sign-in is not set up for this site yet (see docs/Cloud-sync.md).');
  });

  it('asks before adding songs left by another account, and replaces them when declined', async () => {
    const cloud = new FakeCloud({ records: { u2: [song('my__bob', 'Bob song')] } });
    cloud.nextUser = BOB;
    const app = await bootApp({
      cloud,
      confirm: false,
      storage: { ...library(song('my__ada', 'Ada song')), [OWNER_KEY]: 'u1', [DELETED_KEY]: JSON.stringify([{ id: 'my__x', deleted: true, savedAt: '2026-01-01T00:00:00Z' }]) },
    });
    await app.click('#sign-in');
    expect(app.confirm).toHaveBeenCalledWith(expect.stringContaining('1 song from another account'));
    expect(titles(app)).toEqual(['Bob song', 'Paper Lanterns']);
    expect(ids(cloud.stored('u2'))).toEqual(['my__bob']);
    expect(localStorage.getItem(DELETED_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBe('u2');
  });

  it('adds songs left by another account when confirmed', async () => {
    const cloud = new FakeCloud();
    cloud.nextUser = BOB;
    const app = await bootApp({ cloud, storage: { ...library(song('my__ada', 'Ada song')), [OWNER_KEY]: 'u1' } });
    await app.click('#sign-in');
    expect(ids(cloud.stored('u2'))).toEqual(['my__ada']);
  });
});

describe('a remembered session', () => {
  it('syncs quietly on start and shows what changed', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [song('my__a', 'Alpha'), song('my__b', 'Beta')] } });
    const app = await bootApp({ cloud, storage: { ...library(song('my__a', 'Alpha')), [OWNER_KEY]: 'u1' } });
    expect(titles(app)).toEqual(['Alpha', 'Beta', 'Paper Lanterns']);
    expect(app.status()).toBe('Library synced with your account: 1 song from the cloud.');
    expect(app.confirm).not.toHaveBeenCalled();
  });

  it('shows a newer version of the open song saved on another device', async () => {
    const newer = song('my__a', 'Alpha', '2026-02-01T00:00:00.000Z', 'Am\nChanged elsewhere');
    const cloud = new FakeCloud({ user: ADA, records: { u1: [newer] } });
    const app = await bootApp({ cloud, storage: { ...library(song('my__a', 'Alpha')), [OWNER_KEY]: 'u1' }, address: '/?song=my__a' });
    expect(app.sheetText()).toContain('Changed elsewhere');
  });

  it('keeps unsaved edits to the open song', async () => {
    const newer = song('my__a', 'Alpha', '2026-02-01T00:00:00.000Z', 'Am\nChanged elsewhere');
    const cloud = new FakeCloud({ user: ADA, records: { u1: [newer] } });
    const app = await bootApp({ cloud, storage: { ...library(song('my__a', 'Alpha')), [OWNER_KEY]: 'u1' }, address: '/?song=my__a' });
    await app.type('#input', 'C\nMy edit');
    await app.click('#sync-now');
    expect(app.sheetText()).toContain('My edit');
  });

  it('removes a song deleted on another device, leaving it open as unsaved', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [{ id: 'my__a', deleted: true, savedAt: '2026-02-01T00:00:00.000Z' }] } });
    const app = await bootApp({ cloud, storage: { ...library(song('my__a', 'Alpha')), [OWNER_KEY]: 'u1' }, address: '/?song=my__a' });
    expect(titles(app)).toEqual(['Paper Lanterns']);
    expect(app.status()).toBe('Library synced with your account: 1 removed.');
    expect(app.$('.sheet-title').textContent).toBe('Alpha');
    expect(app.$('#save').classList.contains('is-dirty')).toBe(true);
    expect(app.$('#delete').hidden).toBe(true);
  });

  it('reports when the cloud cannot be reached and keeps the browser library', async () => {
    const cloud = new FakeCloud({ user: ADA });
    cloud.failures.pull = { code: 'unavailable' };
    const app = await bootApp({ cloud, storage: library(song('my__a', 'Alpha')) });
    expect(app.status()).toContain('Could not reach the cloud');
    expect(titles(app)).toEqual(['Alpha', 'Paper Lanterns']);
    expect(app.$<HTMLButtonElement>('#sync-now').disabled).toBe(false);
  });
});

describe('saving and deleting while signed in', () => {
  it('sends saves and deletions straight to the account', async () => {
    const cloud = new FakeCloud({ user: ADA });
    const app = await bootApp({ cloud });
    await app.click('#new-song');
    await app.type('#title', 'Gamma');
    await app.type('#input', 'G\nNew words');
    await app.click('#save');
    expect(cloud.stored()).toEqual([expect.objectContaining({ id: 'my__gamma', title: 'Gamma', text: 'G\nNew words' })]);

    await app.click('#delete');
    expect(cloud.stored()).toEqual([expect.objectContaining({ id: 'my__gamma', deleted: true })]);
    expect(localStorage.getItem(DELETED_KEY)).toBeNull();
  });

  it('keeps a save that could not be uploaded and sends it on the next sync', async () => {
    const cloud = new FakeCloud({ user: ADA });
    const app = await bootApp({ cloud });
    cloud.failures.push = { code: 'unavailable' };
    await app.click('#new-song');
    await app.type('#title', 'Delta');
    await app.click('#save');
    expect(app.status()).toMatch(/^Saved “Delta” in this browser, but not in your account yet: Could not reach the cloud.*Use Sync now to retry\.$/);
    expect(app.stored()).toHaveLength(1);
    expect(cloud.stored()).toEqual([]);

    await app.click('#sync-now');
    expect(app.status()).toBe('Library synced: 1 uploaded.');
    expect(ids(cloud.stored())).toEqual(['my__delta']);
  });

  it('keeps a deletion that could not be uploaded and sends it on the next sync', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [song('my__a', 'Alpha')] } });
    const app = await bootApp({ cloud, storage: { ...library(song('my__a', 'Alpha')), [OWNER_KEY]: 'u1' }, address: '/?song=my__a' });
    cloud.failures.push = { code: 'resource-exhausted' };
    await app.click('#delete');
    expect(app.status()).toContain('over its free daily limit');
    expect(JSON.parse(localStorage.getItem(DELETED_KEY)!)).toHaveLength(1);

    await app.click('#sync-now');
    expect(cloud.stored()).toEqual([expect.objectContaining({ id: 'my__a', deleted: true })]);
    expect(titles(app)).toEqual(['Paper Lanterns']);
    expect(localStorage.getItem(DELETED_KEY)).toBeNull();
  });

  it('uploads an imported library file', async () => {
    const cloud = new FakeCloud({ user: ADA });
    const app = await bootApp({ cloud });
    const input = app.$<HTMLInputElement>('#import-library');
    const file = { name: 'lib.json', text: async () => JSON.stringify([song('my__x', 'Imported')]) };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await app.settle();
    expect(app.status()).toBe('Imported library: 1 new, 0 updated.');
    expect(ids(cloud.stored())).toEqual(['my__x']);
  });

  it('does not touch the cloud while signed out', async () => {
    const cloud = new FakeCloud();
    const app = await bootApp({ cloud });
    await app.click('#new-song');
    await app.type('#title', 'Offline');
    await app.click('#save');
    expect(app.status()).toBe('Saved “Offline” to your library.');
    expect(cloud.pushes).toEqual([]);
  });
});

describe('signing out', () => {
  it('keeps the songs in this browser when asked to', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [song('my__a', 'Alpha')] } });
    const app = await bootApp({ cloud, confirm: false });
    await app.click('#sign-out');
    expect(app.status()).toBe('Signed out. Your songs stay in this browser.');
    expect(app.$('#signed-out').hidden).toBe(false);
    expect(titles(app)).toEqual(['Alpha', 'Paper Lanterns']);
    expect(localStorage.getItem(OWNER_KEY)).toBe('u1');
  });

  it('removes the songs from this browser on a shared computer', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [song('my__a', 'Alpha')] } });
    const app = await bootApp({ cloud, address: '/?song=my__a' });
    await app.click('#sign-out');
    expect(app.confirm).toHaveBeenCalledWith(expect.stringContaining('Also remove your songs from this browser?'));
    expect(app.status()).toBe('Signed out and removed your songs from this browser.');
    expect(titles(app)).toEqual(['Paper Lanterns']);
    expect(app.$('.sheet-title').textContent).toBe('Paper Lanterns');
    expect(app.stored()).toEqual([]);
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(cloud.stored()).toHaveLength(1);
  });

  it('keeps unsaved work open when removing the songs', async () => {
    const cloud = new FakeCloud({ user: ADA, records: { u1: [song('my__a', 'Alpha')] } });
    const app = await bootApp({ cloud, address: '/?song=my__a' });
    await app.type('#input', 'C\nUnsaved idea');
    await app.click('#sign-out');
    expect(app.sheetText()).toContain('Unsaved idea');
  });

  it('stays signed in when signing out fails', async () => {
    const cloud = new FakeCloud({ user: ADA });
    const app = await bootApp({ cloud });
    cloud.failures.signOut = new Error('boom');
    await app.click('#sign-out');
    expect(app.status()).toBe('Cloud sync failed: boom');
    expect(app.$('#signed-in').hidden).toBe(false);
  });
});

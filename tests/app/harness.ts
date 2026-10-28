// Boots the real app (src/app/main.ts) against index.html in jsdom, so tests
// can drive it the way a user would: click, type, and read the DOM back.

import { readProjectFile } from '../helpers';

export type ServerRoute = (url: URL) => { status?: number; body: unknown };

export interface BootOptions {
  /** Address to open the app at, e.g. "/?song=my__x". */
  address?: string;
  /** Value stored in localStorage before the app starts. */
  storage?: Record<string, string>;
  /** Responses of the optional local server by path; omit for static hosting. */
  server?: Record<string, ServerRoute>;
  confirm?: boolean;
}

export interface App {
  $: <T extends HTMLElement = HTMLElement>(selector: string) => T;
  $$: <T extends HTMLElement = HTMLElement>(selector: string) => T[];
  /** Waits for pending timers and promises (debounced refresh, async opens). */
  settle: () => Promise<void>;
  click: (selector: string | HTMLElement) => Promise<void>;
  type: (selector: string, value: string) => Promise<void>;
  press: (key: string, init?: KeyboardEventInit) => Promise<void>;
  status: () => string;
  sheetText: () => string;
  stored: () => unknown[];
  confirm: jest.Mock;
  print: jest.Mock;
  requests: string[];
}

const body = /<body>([\s\S]*)<\/body>/.exec(readProjectFile('index.html'))![1]!.replace(/<script[\s\S]*?<\/script>/, '');

// The app attaches listeners to document and window and never detaches them, so
// each boot removes the previous app's listeners to keep tests independent.
const attached: [EventTarget, string, EventListenerOrEventListenerObject][] = [];
for (const target of [document, window] as EventTarget[]) {
  const original = target.addEventListener.bind(target);
  target.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    attached.push([target, type, listener]);
    original(type, listener, options);
  };
}

export function disposeApp(): void {
  for (const [target, type, listener] of attached.splice(0)) target.removeEventListener(type, listener);
  jest.clearAllTimers();
}

export async function bootApp(options: BootOptions = {}): Promise<App> {
  disposeApp();
  document.body.innerHTML = body;
  localStorage.clear();
  for (const [key, value] of Object.entries(options.storage ?? {})) localStorage.setItem(key, value);
  history.replaceState(null, '', options.address ?? '/');

  const requests: string[] = [];
  if (options.server) {
    const routes = options.server;
    (globalThis as { fetch?: unknown }).fetch = async (path: string) => {
      requests.push(path);
      const url = new URL(path, 'http://localhost');
      const route = routes[url.pathname];
      if (!route) return { ok: false, status: 404, json: async () => Promise.reject(new Error('not json')) };
      const { status = 200, body: payload } = route(url);
      return { ok: status < 400, status, json: async () => payload };
    };
  } else {
    delete (globalThis as { fetch?: unknown }).fetch;
  }

  const confirm = jest.fn(() => options.confirm ?? true);
  const print = jest.fn();
  window.confirm = confirm;
  window.print = print;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  (globalThis as { CSS?: unknown }).CSS = { escape: (text: string) => text.replace(/["\\]/g, '\\$&') };

  jest.resetModules();
  await jest.isolateModulesAsync(async () => {
    await import('../../src/app/main');
  });

  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(200);
      for (let tick = 0; tick < 10; tick++) await Promise.resolve();
    }
  };
  const $ = <T extends HTMLElement>(selector: string) => {
    const node = document.querySelector<T>(selector);
    if (!node) throw new Error(`No element matches ${selector}`);
    return node;
  };
  const app: App = {
    $,
    $$: <T extends HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)],
    settle,
    async click(target) {
      (typeof target === 'string' ? $(target) : target).click();
      await settle();
    },
    async type(selector, value) {
      const field = $<HTMLInputElement | HTMLTextAreaElement>(selector);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },
    async press(key, init = {}) {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    status: () => $('#status').textContent ?? '',
    sheetText: () => $('#sheet').textContent ?? '',
    stored: () => JSON.parse(localStorage.getItem('compact-chords.library.v1') ?? '[]') as unknown[],
    confirm,
    print,
    requests,
  };
  await settle();
  return app;
}

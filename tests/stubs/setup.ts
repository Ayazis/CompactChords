// jsdom's global scope lacks structuredClone, which every browser (and Node) has.
if (typeof structuredClone === 'undefined') {
  (globalThis as { structuredClone?: unknown }).structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

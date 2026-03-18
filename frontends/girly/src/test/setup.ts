import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  const storageBacking = new Map<string, string>();

  const localStorageMock: Storage = {
    get length() {
      return storageBacking.size;
    },
    clear() {
      storageBacking.clear();
    },
    getItem(key: string) {
      return storageBacking.has(key) ? storageBacking.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(storageBacking.keys())[index] ?? null;
    },
    removeItem(key: string) {
      storageBacking.delete(key);
    },
    setItem(key: string, value: string) {
      storageBacking.set(key, String(value));
    },
  };

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });

  const matchMediaMock = (query: string): MediaQueryList => ({
    matches: query === '(prefers-color-scheme: dark)' ? false : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });

  Object.defineProperty(window, 'matchMedia', {
    value: matchMediaMock,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'matchMedia', {
    value: matchMediaMock,
    configurable: true,
    writable: true,
  });
}

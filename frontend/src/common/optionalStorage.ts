// Preferences only. Failed persistence stays usable in this tab and is retried
// when storage becomes available; it never establishes account/access authority.
function optionalStorage(kind: 'localStorage' | 'sessionStorage') {
  const cached = new Map<string, string | null>();
  const pending = new Map<string, string | null>();
  function browser(): Storage {
    if (typeof window === 'undefined') throw Error('Storage unavailable');
    return window[kind];
  }
  return {
    getItem(key: string): string | null {
      try {
        const storage = browser();
        if (pending.has(key)) {
          const value = pending.get(key)!;
          if (value === null) storage.removeItem(key); else storage.setItem(key, value);
          pending.delete(key);
        }
        const value = storage.getItem(key);
        cached.set(key, value);
        return value;
      } catch { return cached.get(key) ?? null; }
    },
    setItem(key: string, value: string) {
      cached.set(key, value);
      try { browser().setItem(key, value); pending.delete(key); }
      catch { pending.set(key, value); }
    },
    removeItem(key: string) {
      cached.set(key, null);
      try { browser().removeItem(key); pending.delete(key); }
      catch { pending.set(key, null); }
    },
  };
}
export const optionalLocalStorage = optionalStorage('localStorage');
export const optionalSessionStorage = optionalStorage('sessionStorage');

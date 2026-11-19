// Browser storage stand-ins: app modules (Supabase client) read storage at import time.
const makeStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
(globalThis as any).localStorage ??= makeStore();
(globalThis as any).sessionStorage ??= makeStore();

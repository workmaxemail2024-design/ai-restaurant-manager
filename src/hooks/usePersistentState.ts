import { useEffect, useState } from "react";

/** useState that survives navigation and refresh (localStorage). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw == null ? initial : (JSON.parse(raw) as T); } catch { return initial; }
  });
  useEffect(() => {
    try { const raw = localStorage.getItem(key); setValue(raw == null ? initial : (JSON.parse(raw) as T)); } catch { /* keep */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }, [key, value]);
  return [value, setValue] as const;
}

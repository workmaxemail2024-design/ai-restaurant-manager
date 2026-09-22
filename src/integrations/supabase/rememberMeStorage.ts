// "Remember me" support for Supabase auth storage.
//
// Supabase decides session persistence at the storage layer, not per login.
// This wrapper keeps the existing storage (brokeredPreviewStorage / localStorage)
// when the user opts in, and routes the auth session to sessionStorage when they
// don't — so an unchecked login ends with the browser session.
//
// Security: only a non-secret boolean preference flag is stored. Tokens stay in
// the standard Supabase storage keys; passwords are never stored anywhere.

import type { SupportedStorage } from '@supabase/supabase-js';

const REMEMBER_FLAG = 'restaurantai:remember-me';

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_FLAG) !== 'false';
  } catch {
    return true;
  }
}

export function setRememberMe(value: boolean): void {
  try {
    localStorage.setItem(REMEMBER_FLAG, value ? 'true' : 'false');
  } catch {
    // Storage unavailable (private mode): fall back to session-only behaviour.
  }
}

export function rememberMeStorage(persistent: SupportedStorage): SupportedStorage {
  const sessionStore: SupportedStorage = {
    getItem: (key) => {
      try {
        return Promise.resolve(sessionStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    },
    setItem: (key, value) => {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // ignore
      }
      return Promise.resolve();
    },
    removeItem: (key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
      return Promise.resolve();
    },
  };

  const active = () => (getRememberMe() ? persistent : sessionStore);
  const inactive = () => (getRememberMe() ? sessionStore : persistent);

  return {
    getItem: async (key) => {
      const value = await active().getItem(key);
      if (value != null) return value;

      // Recovery path: a session can legitimately land in the other store when
      // the token is written before the preference is applied (e.g. a session
      // restored during page load, or a login that set the flag mid-flight).
      // Reading only the active store would look like "logged out" to the app
      // and silently drop a remembered session, so adopt it instead of losing it.
      const fallback = await inactive().getItem(key);
      if (fallback == null) return null;
      await active().setItem(key, fallback);
      await inactive().removeItem(key);
      return fallback;
    },
    setItem: async (key, value) => {
      // Write to the chosen store first so a failure on the other store can
      // never leave the session unwritten, then clear the other copy so a
      // stale session can't resurrect after the user switches modes.
      await active().setItem(key, value);
      await inactive().removeItem(key);
    },
    removeItem: async (key) => {
      // Explicit sign-out must clear both stores.
      await persistent.removeItem(key);
      await sessionStore.removeItem(key);
    },
  };
}

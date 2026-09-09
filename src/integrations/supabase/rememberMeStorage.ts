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
    getItem: (key) => Promise.resolve(sessionStorage.getItem(key)),
    setItem: (key, value) => {
      sessionStorage.setItem(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      sessionStorage.removeItem(key);
      return Promise.resolve();
    },
  };

  const active = () => (getRememberMe() ? persistent : sessionStore);
  const inactive = () => (getRememberMe() ? sessionStore : persistent);

  return {
    getItem: (key) => active().getItem(key),
    setItem: async (key, value) => {
      // Write to the chosen store and clear the other so a stale session can't
      // resurrect after the user switches modes.
      await inactive().removeItem(key);
      await active().setItem(key, value);
    },
    removeItem: async (key) => {
      await persistent.removeItem(key);
      await sessionStore.removeItem(key);
    },
  };
}

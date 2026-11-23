import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Me } from '../../../shared/api';
import { SERVER_URL } from '../mode';
import { call, setSession } from './client';
import { reconnectLive } from './live';

// Sign-in with the Bell Space server. The session token is stored on the
// phone (like the Supabase pilot's session) and sent as a bearer token.
const TOKEN_KEY = 'bellspace.server.token';

type ServerAuth = {
  configured: boolean;
  loading: boolean;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Context = createContext<ServerAuth>({
  configured: false, loading: false, me: null, signIn: async () => 'Not connected', signOut: async () => {},
});

export const useServerAuth = () => useContext(Context);

export function ServerAuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(SERVER_URL));

  const forget = useCallback(async () => {
    setSession(null);
    setMe(null);
    reconnectLive();
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    if (!SERVER_URL) return;
    let cancelled = false;
    (async () => {
      const saved = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
      if (!saved) { setLoading(false); return; }
      setSession(saved, () => { forget(); });
      try {
        const { me: next } = await call<{ me: Me }>('GET', '/v1/me');
        if (!cancelled) { setMe(next); reconnectLive(); }
      } catch (e) {
        // Keep the token when the server is just unreachable; drop it when it is no longer valid.
        if ((e as { status?: number }).status === 401) await forget();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [forget]);

  const value = useMemo<ServerAuth>(() => ({
    configured: Boolean(SERVER_URL), loading, me,
    signIn: async (email, password) => {
      try {
        const r = await call<{ me: Me; token: string }>('POST', '/v1/auth/sign-in', { email: email.trim(), password, client: 'app' });
        setSession(r.token, () => { forget(); });
        await AsyncStorage.setItem(TOKEN_KEY, r.token).catch(() => {});
        setMe(r.me);
        reconnectLive();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    signOut: async () => {
      await call('POST', '/v1/auth/sign-out').catch(() => {});
      await forget();
    },
  }), [loading, me, forget]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** "Student", "Student guide", or the staff access list. */
export function roleLabel(me: Me) {
  if (me.kind === 'staff') return `Staff${me.permissions.length ? '' : ' (no access yet)'}`;
  return me.guide?.active ? 'Student guide' : 'Student';
}

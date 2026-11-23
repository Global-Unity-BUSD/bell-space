import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { backend, errorText } from './client';
import type { Role, Topic } from './chatLogic';

export type Profile = { id: string; first_name: string; role: Role };
export type GuideSettings = { guide_id: string; topics: Topic[]; languages: string[]; available: boolean };

type Auth = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth>({
  configured: false, loading: false, session: null, profile: null,
  signIn: async () => 'Not connected', signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Signed-in account and its role, read from the database (never trusted from the app). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(backend));

  useEffect(() => {
    if (!backend) return;
    const client = backend;
    let cancelled = false;
    const load = async (next: Session | null) => {
      setSession(next);
      if (!next) { setProfile(null); setLoading(false); return; }
      const { data } = await client.from('profiles').select('id, first_name, role').eq('id', next.user.id).maybeSingle();
      if (!cancelled) { setProfile((data as Profile | null) ?? null); setLoading(false); }
    };
    client.auth.getSession().then(({ data }) => load(data.session));
    const { data } = client.auth.onAuthStateChange((event, next) => {
      // Supabase asks that other calls run outside this callback.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => load(next), 0);
      else setSession(next);
    });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);

  const value: Auth = {
    configured: Boolean(backend), loading, session, profile,
    signIn: async (email, password) => {
      if (!backend) return 'Not connected';
      const { error } = await backend.auth.signInWithPassword({ email: email.trim(), password });
      return error ? errorText(error) : null;
    },
    signOut: async () => { await backend?.auth.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

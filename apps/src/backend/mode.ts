// Which backend the app uses for Chat, Updates and sign-in (set in .env.local):
//   EXPO_PUBLIC_BACKEND=server    the Bell Space server (EXPO_PUBLIC_SERVER_URL), the default
//   EXPO_PUBLIC_BACKEND=supabase  the earlier Supabase pilot (EXPO_PUBLIC_SUPABASE_URL / _KEY), kept as a fallback
// With nothing configured the app runs with the map only. Expo inlines these
// values at build time, so restart `npx expo start --clear` after changing them.

export type BackendKind = 'server' | 'supabase' | 'none';

const choice = process.env.EXPO_PUBLIC_BACKEND;
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL?.trim().replace(/\/+$/, '') || null;
const supabaseReady = Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY);

export const BACKEND: BackendKind =
  choice === 'supabase' ? (supabaseReady ? 'supabase' : 'none')
    : choice === 'server' || SERVER_URL ? (SERVER_URL ? 'server' : 'none')
      : supabaseReady ? 'supabase' : 'none';

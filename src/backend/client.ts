import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { BACKEND } from './mode';

// Supabase project for the Chat/Updates pilot. Set both in `.env.local`
// (see `.env.example`). The publishable (anon) key is safe in the app: what
// each account may read or change is enforced by the database policies in
// supabase/migrations. Without them the app runs with the map only.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// Only when the Supabase pilot is the chosen backend (src/backend/mode.ts).
export const backend: SupabaseClient | null = BACKEND === 'supabase' && url && key
  ? createClient(url, key, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })
  : null;

// Refresh the session only while the app is in the foreground.
if (backend && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') backend.auth.startAutoRefresh();
    else backend.auth.stopAutoRefresh();
  });
}

/** A short, student-readable message for a failed request. */
export function errorText(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/Invalid login credentials/i.test(message)) return 'That email or password is not right.';
  if (/network|fetch/i.test(message)) return 'No connection. Check the internet and try again.';
  return message;
}

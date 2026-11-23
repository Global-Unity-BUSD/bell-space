import { useEffect, useRef } from 'react';

import type { LiveHint } from '../../shared/api.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Fired when the server says the session has ended; the app shows sign-in. */
export const SIGNED_OUT = 'bell:signed-out';

/**
 * Call the Bell Space API with the session cookie. `X-Bell-Client` is required
 * by the server for changes made with the cookie (cross-site requests cannot set it).
 */
export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: object | FormData): Promise<T> {
  const headers: Record<string, string> = { 'x-bell-client': 'web' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body || method !== 'GET') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'No connection to the server. Check the network and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && path !== '/v1/auth/sign-in') window.dispatchEvent(new Event(SIGNED_OUT));
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- live hints

type Listener = (hint: LiveHint) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (socket || !listeners.size) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/v1/live`);
  socket = ws;
  ws.onmessage = (e) => {
    const hint = JSON.parse(String(e.data)) as LiveHint;
    // After a reconnect, anything may have changed while the socket was down.
    if (hint.t === 'ready') {
      if (retry > 0) for (const l of listeners) l({ t: 'resync' });
      retry = 0;
      return;
    }
    for (const l of listeners) l(hint);
  };
  ws.onclose = () => {
    socket = null;
    if (!listeners.size) return;
    retry += 1;
    timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
  };
}

/** Run `onHint` for every live hint while the component is mounted. */
export function useLive(onHint: Listener) {
  const ref = useRef(onHint);
  useEffect(() => { ref.current = onHint; });
  useEffect(() => {
    const l: Listener = (h) => ref.current(h);
    listeners.add(l);
    connect();
    return () => {
      listeners.delete(l);
      if (!listeners.size) {
        if (timer) clearTimeout(timer);
        socket?.close();
        socket = null;
      }
    };
  }, []);
}

// ---------------------------------------------------------------- formatting

export function formatDateTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** <input type=date> + <input type=time> (local time) → ISO, or null when both are empty. */
export function joinDateTime(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || '00:00'}`).toISOString();
}

export function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

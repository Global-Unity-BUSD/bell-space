import { useEffect, useRef } from 'react';

import type { LiveHint } from '../../../../shared/api';
import { SERVER_URL } from '../mode';
import { currentToken } from './client';

// One WebSocket to /v1/live while any screen listens. The server sends hints
// (ids only); screens fetch the content through the API. After a reconnect,
// listeners get { t: 'resync' } because hints may have been missed.

type Listener = (hint: LiveHint) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const liveUrl = () => (SERVER_URL ? `${SERVER_URL.replace(/^http/, 'ws')}/v1/live` : null);

function connect() {
  const url = liveUrl();
  if (socket || !listeners.size || !url) return;
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: currentToken() }));
  ws.onmessage = (e) => {
    let hint: LiveHint;
    try { hint = JSON.parse(String(e.data)) as LiveHint; } catch { return; }
    if (hint.t === 'ready') {
      if (retry > 0) for (const l of listeners) l({ t: 'resync' });
      retry = 0;
      return;
    }
    for (const l of listeners) l(hint);
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (!listeners.size) return;
    retry += 1;
    timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
  };
}

function disconnect() {
  if (timer) { clearTimeout(timer); timer = null; }
  const ws = socket;
  socket = null;
  ws?.close();
}

/** After sign-in or sign-out: reconnect so the server knows who is listening. */
export function reconnectLive() {
  disconnect();
  retry = 1;
  connect();
}

/** Call `onHint` for each hint while `enabled` (e.g. while the tab is shown). */
export function useLive(enabled: boolean, onHint: Listener) {
  const ref = useRef(onHint);
  useEffect(() => { ref.current = onHint; });
  useEffect(() => {
    if (!enabled) return;
    const l: Listener = (h) => ref.current(h);
    listeners.add(l);
    connect();
    return () => {
      listeners.delete(l);
      if (!listeners.size) disconnect();
    };
  }, [enabled]);
}

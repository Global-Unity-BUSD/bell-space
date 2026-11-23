import { SERVER_URL } from '../mode';

// HTTP calls to the Bell Space server (/v1/). The session token is a bearer
// token kept by server/auth.tsx; the server decides what each account may do.

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export function setSession(next: string | null, signedOut?: () => void) {
  token = next;
  if (signedOut) onSignedOut = signedOut;
}
export const currentToken = () => token;

export class ServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  if (!SERVER_URL) throw new ServerError(0, 'Not connected');
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  } catch {
    throw new ServerError(0, 'No connection. Check the internet and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/v1/auth/sign-in') onSignedOut?.();
    throw new ServerError(res.status, data.error ?? `Something went wrong (${res.status}).`);
  }
  return data as T;
}

/** A path from the server (e.g. a photo_url) as a full address. */
export const serverUrl = (path: string) => `${SERVER_URL ?? ''}${path}`;

import { useAuthStore } from '../stores/auth.store';
import { getAuthToken } from './auth-token';

// Served from the same origin as the API, so every path is relative. Never
// hardcode a host or port here: a build that names one drives whichever server
// is on that port, not its own.
const BASE = '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      useAuthStore.getState().forceLogout("Sessiya tugadi. Iltimos qaytadan kiring.");
    }
    const code = json?.error?.code ?? 'UNKNOWN';
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(message) as Error & { code?: string; details?: unknown };
    err.code = code;
    err.details = json?.error?.details;
    throw err;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

import { requireMasterUrl } from '../lib/env';
import { useAuthStore } from '../stores/auth.store';

type RequestOptions = {
  method: string;
  body?: unknown;
  // `keepalive` lets a request outlive renderer teardown — needed when a call
  // is fired from a `beforeunload` handler as the Electron window is closing.
  keepalive?: boolean;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const token = useAuthStore.getState().token;
  const masterUrl = requireMasterUrl();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${masterUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    keepalive: options.keepalive,
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as unknown) : null;

  if (response.status === 401 && token) {
    useAuthStore.getState().forceLogout("Sessiya tugadi. Iltimos qaytadan kiring.");
  }

  if (!response.ok) {
    const errBody = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const code = errBody?.code ?? 'UNKNOWN';
    const message = errBody?.message ?? `HTTP ${response.status}`;
    const err = new Error(message) as Error & { code?: string; details?: unknown };
    err.code = code;
    err.details = errBody?.details;
    throw err;
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: { keepalive?: boolean }) =>
    request<T>(path, { method: 'POST', body, keepalive: opts?.keepalive }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

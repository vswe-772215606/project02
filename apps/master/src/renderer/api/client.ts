const BASE = 'http://localhost:4000';

let token: string | null = null;
export function setAuthToken(t: string | null) {
  token = t;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

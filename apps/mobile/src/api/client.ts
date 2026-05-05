import { getMasterUrl } from '../lib/env';
import { useConnectionStore } from '../stores/connection.store';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(cb: () => void) {
  onUnauthorized = cb;
}

export const api = {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    const masterUrl = getMasterUrl();
    if (!masterUrl) {
      throw Object.assign(new Error('MASTER_URL_NOT_CONFIGURED'), { code: 'MASTER_URL_NOT_CONFIGURED' });
    }

    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`${masterUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      useConnectionStore.getState().setStatus('auth-failed');
      onUnauthorized?.();
      throw Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED' });
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(
        new Error(`Server error (${response.status})`),
        { code: 'SERVER_ERROR' }
      );
    }

    if (!response.ok) {
      throw data.error || { message: 'Unknown error' };
    }

    return data as T;
  },

  get<T>(path: string) {
    return this.request<T>(path);
  },

  post<T>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  },
};

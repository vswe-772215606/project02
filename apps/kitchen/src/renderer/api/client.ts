import { getMasterUrl } from '../lib/env';
import { useAuthStore } from '../stores/auth.store';

export const api = {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = useAuthStore.getState().token;
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`${getMasterUrl()}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Unauthorized');
    }

    const data = await response.json();

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

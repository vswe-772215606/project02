import { api } from './client';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: { id: string; role: string; fullName: string } }>(
      '/api/auth/login',
      { username, password },
    ),
  me: () => api.get<{ user: { id: string; role: string; fullName: string } }>('/api/auth/me'),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
};

import { api } from './client';

export const authApi = {
  loginPin: (pin: string) =>
    api.post<{ token: string; user: { id: string; role: string; fullName: string } }>(
      '/api/auth/login-pin',
      { pin },
    ),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  me: () => api.get<{ user: { id: string; role: string; fullName: string } }>('/api/auth/me'),
};

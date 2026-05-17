import { api } from './client';

export type User = {
  id: string;
  username: string | null;
  fullName: string;
  role: 'OWNER' | 'ADMIN' | 'WAITER';
  isActive: boolean;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export const authApi = {
  loginPin: (data: { pin: string }) =>
    api.post<LoginResponse>('/api/auth/login-pin', data),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  me: () => api.get<{ user: User }>('/api/auth/me'),
};

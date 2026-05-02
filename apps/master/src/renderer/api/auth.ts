import { api } from './client';

export interface User {
  id: string;
  username: string | null;
  fullName: string;
  role: 'OWNER' | 'ADMIN' | 'WAITER' | 'KITCHEN';
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: (data: { username: string; password: string }) => 
    api.post<LoginResponse>('/api/auth/login', data),
  loginPin: (data: { pin: string }) => 
    api.post<LoginResponse>('/api/auth/login-pin', data),
  logout: () => 
    api.post<{ ok: true }>('/api/auth/logout'),
  me: () => 
    api.get<{ user: User }>('/api/auth/me'),
};

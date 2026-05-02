import { api } from './client';
import { User } from './auth';

export const usersApi = {
  list: () => api.get<User[]>('/api/users'),
  create: (data: { role: string; fullName: string; username?: string; password?: string; pin?: string }) => 
    api.post<User>('/api/users', data),
  update: (id: string, data: Partial<User> & { password?: string; pin?: string }) => 
    api.patch<User>(`/api/users/${id}`, data),
  deactivate: (id: string) => api.post<User>(`/api/users/${id}/deactivate`),
};

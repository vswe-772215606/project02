import { api } from './client';
export const settingsApi = {
  get: () => api.get<Record<string, string>>('/api/settings'),
  update: (key: string, value: string) => 
    api.patch<{ key: string; value: string }>('/api/settings', { key, value }),
};

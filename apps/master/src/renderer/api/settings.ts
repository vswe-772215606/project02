import { api } from './client';

export const settingsApi = {
  get: () => api.get<Record<string, any>>('/api/settings'),
  update: (key: string, value: any) => api.patch<{ key: string; value: any }>('/api/settings', { key, value }),
};

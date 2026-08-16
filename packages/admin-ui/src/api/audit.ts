import { api } from './client';

export type AuditLogItem = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    role: string;
  };
};

export type AuditListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const auditApi = {
  list: (params: {
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      q.set(key, String(value));
    });
    return api.get<AuditListResponse>(`/api/audit?${q.toString()}`);
  },
};

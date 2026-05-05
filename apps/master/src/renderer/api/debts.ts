import { api } from './client';

export type DebtListItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  debtorName: string;
  debtorPhone: string | null;
  note: string | null;
  originalAmount: string;
  remainingAmount: string;
  repaidAmount: string;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'PARTIAL' | 'PAID';
};

export type DebtDetail = {
  id: string;
  orderId: string;
  orderNumber: string;
  debtorName: string;
  debtorPhone: string | null;
  note: string | null;
  originalAmount: string;
  remainingAmount: string;
  repaidAmount: string;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'PARTIAL' | 'PAID';
  repayments: Array<{
    id: string;
    amount: string;
    method: 'CASH' | 'CARD';
    paidAt: string;
    note: string | null;
    receivedById: string;
    receivedByName: string;
  }>;
  order: {
    id: string;
    orderNumber: string;
    closedAt: string | null;
    totalSnapshot: string;
    waiterName: string;
    tableName: string | null;
  };
};

export const debtsApi = {
  list: (params?: { status?: string; date?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.date) search.set('date', params.date);
    const qs = search.toString();
    return api.get<{ items: DebtListItem[] }>(`/api/debts${qs ? `?${qs}` : ''}`);
  },
  getById: (id: string) => api.get<DebtDetail>(`/api/debts/${id}`),
  repay: (id: string, data: { amount: number; method: 'CASH' | 'CARD'; paidAt?: string; note?: string }) =>
    api.post<DebtDetail>(`/api/debts/${id}/repayments`, data),
};

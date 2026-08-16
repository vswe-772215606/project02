import { api } from './client';

export type ExpenseCategory = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
};

export type ExpenseReturnRow = {
  id: string;
  amount: string;
  receivedAt: string;
  receivedById: string;
  receivedByName: string;
  note: string | null;
  createdAt: string;
};

export type ExpenseRepayStatus =
  | 'NOT_REPAYABLE'
  | 'PENDING'
  | 'PARTIAL'
  | 'RETURNED'
  | 'WRITTEN_OFF';

export type ExpenseItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  signedAmount: string;
  reason: string;
  note: string | null;
  occurredAt: string;
  status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
  reversedExpenseId: string | null;
  purchaseId: string | null;
  repayable: boolean;
  repayStatus: ExpenseRepayStatus;
  remainingAmount: string | null;
  returnedTotal: string | null;
  writtenOffAt: string | null;
  writtenOffReason: string | null;
  writtenOffById: string | null;
  writtenOffByName: string | null;
  returns: ExpenseReturnRow[];
  createdById: string;
  createdByName: string;
  createdAt: string;
};

export const expensesApi = {
  getCategories: () => api.get<ExpenseCategory[]>('/api/expense-categories'),
  getByDate: (date: string) => api.get<{
    date: string;
    items: ExpenseItem[];
    totals: { gross: string; reversal: string; net: string };
    byCategory: Array<{ categoryId: string; categoryName: string; amount: string }>;
  }>(`/api/expenses?date=${date}`),
  create: (data: {
    categoryId?: string;
    amount: number;
    reason: string;
    note?: string;
    occurredAt: string;
    repayable?: boolean;
  }) => api.post<ExpenseItem>('/api/expenses', data),
  reverse: (id: string, note: string) =>
    api.post<{ original: ExpenseItem; reversal: ExpenseItem }>(`/api/expenses/${id}/reverse`, { note }),
  recordReturn: (
    id: string,
    data: { amount: number; receivedAt?: string; note?: string },
  ) => api.post<ExpenseItem>(`/api/expenses/${id}/returns`, data),
  writeOff: (id: string, reason: string) =>
    api.post<ExpenseItem>(`/api/expenses/${id}/write-off`, { reason }),
  search: (params: {
    q?: string;
    repayable?: boolean;
    openRepayable?: boolean;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.repayable !== undefined) qs.set('repayable', String(params.repayable));
    if (params.openRepayable) qs.set('openRepayable', 'true');
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.limit) qs.set('limit', String(params.limit));
    const tail = qs.toString();
    return api.get<{ items: ExpenseItem[] }>(`/api/expenses/search${tail ? '?' + tail : ''}`);
  },
};

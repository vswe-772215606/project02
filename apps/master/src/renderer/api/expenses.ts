import { api } from './client';

export type ExpenseCategory = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
};

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
  create: (data: { categoryId: string; amount: number; reason: string; note?: string; occurredAt: string }) =>
    api.post<ExpenseItem>('/api/expenses', data),
  reverse: (id: string, note: string) =>
    api.post<{ original: ExpenseItem; reversal: ExpenseItem }>(`/api/expenses/${id}/reverse`, { note }),
};

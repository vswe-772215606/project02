import { api } from './client';

export type FinanceDaily = {
  date: string;
  sales: {
    closedOrders: number;
    walkoutOrders: number;
    grossSales: string;
    discounts: string;
    netFood: string;
    serviceCharge: string;
    billedTotal: string;
    walkoutLoss: string;
  };
  cashflow: {
    cashIn: string;
    cardIn: string;
    debtOpened: string;
    debtRepaidCash: string;
    debtRepaidCard: string;
    expenseReturns: string;
    totalIn: string;
  };
  outflow: {
    purchasesTotal: string;
    purchasesCount: number;
    expensesGross: string;
    expensesReversal: string;
    expensesNet: string;
    operatingExpense: string;
    pendingRepayable: string;
    totalOut: string;
  };
  drawer: {
    movement: string;
    outstandingDebts: string;
  };
  purchases: Array<{
    id: string;
    occurredAt: string;
    ingredientName: string;
    quantityBuyUnit: string;
    buyUnit: string;
    totalCostUzs: string;
    supplierNote: string | null;
  }>;
  expensesItems: Array<{
    id: string;
    occurredAt: string;
    reason: string;
    amount: string;
    categoryName: string;
    repayable: boolean;
    repayStatus: 'NOT_REPAYABLE' | 'PENDING' | 'PARTIAL' | 'RETURNED' | 'WRITTEN_OFF';
    purchaseId: string | null;
    status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
  }>;
  closedOrders: Array<{
    id: string;
    closedAt: string | null;
    waiterName: string;
    tableName: string | null;
    billedTotal: string;
  }>;
};

export type ServiceChargeMatrix = {
  from: string;
  to: string;
  days: number;
  dayLabels: Array<{
    key: string;        // YYYY-MM-DD
    day: number;        // 1..31
    month: number;      // 1..12
    weekday: number;    // 0=Sun..6=Sat
    isMonthStart: boolean;
  }>;
  waiters: Array<{
    waiterId: string;
    waiterName: string;
    daily: string[];
    total: string;
    orderCount: number;
  }>;
  dayTotals: string[];
  grandTotal: string;
};

export const financeApi = {
  daily: (date?: string) =>
    api.get<FinanceDaily>(`/api/finance/daily${date ? `?date=${date}` : ''}`),
  serviceChargeMatrix: (params?: { from?: string; to?: string; month?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.month && !params.from && !params.to) q.set('month', params.month);
    const qs = q.toString();
    return api.get<ServiceChargeMatrix>(`/api/finance/service-charge${qs ? '?' + qs : ''}`);
  },
};

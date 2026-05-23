import { api } from './client';

export type FinanceDailyClosedSnapshot = {
  date: string;
  grossSales: string;
  discounts: string;
  netSales: string;
  serviceCharge: string;
  billedTotal: string;
  closedOrders: number;
  walkoutOrders: number;
  walkoutLoss: string;
  cashIn: string;
  cardIn: string;
  debtOpened: string;
  debtRepaidCash: string;
  debtRepaidCard: string;
  expenseReturns: string;
  realCashIn: string;
  expensesNonPurchase: string;
  purchasesTotal: string;
  expensesTotal: string;
  expensesGross: string;
  expensesReversal: string;
  expensesNet: string;
  operatingExpense: string;
  pendingRepayable: string;
  drawerMovement: string;
  outstandingDebts: string;
};

export type FinanceAdjustments = {
  expenseCount: number;
  expenseTotal: string;
  purchaseCount: number;
  purchaseTotal: string;
  expenses: Array<{
    id: string;
    occurredAt: string;
    createdAt: string;
    categoryName: string;
    reason: string;
    amount: string;
    status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
    createdByName: string;
  }>;
  purchases: Array<{
    id: string;
    occurredAt: string;
    createdAt: string;
    ingredientName: string;
    quantityBuyUnit: string;
    buyUnit: string;
    totalCostUzs: string;
    recordedByName: string;
  }>;
};

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
    // YANGI: ikki marta sanashni oldini olish uchun.
    expensesNonPurchase: string;
    purchasesTotal: string;
    expensesTotal: string;
    purchasesCount: number;
    expensesGross: string;
    expensesReversal: string;
    expensesNet: string;
    operatingExpense: string;
    pendingRepayable: string;
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
    isAdjustment: boolean;
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
    isAdjustment: boolean;
  }>;
  closedOrders: Array<{
    id: string;
    closedAt: string | null;
    waiterName: string;
    tableName: string | null;
    billedTotal: string;
  }>;
  closed: null | {
    closedAt: string;
    closedByName: string;
    note: string | null;
    snapshot: FinanceDailyClosedSnapshot;
  };
  adjustments: FinanceAdjustments | null;
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
  dailyClose: (input: { date?: string; note?: string }) =>
    api.post<{
      id: string;
      date: string;
      closedAt: string;
      closedByName: string;
      snapshot: FinanceDailyClosedSnapshot;
      note: string | null;
    }>('/api/finance/daily-close', input),
  dailyReopen: (input: { date: string; reason: string }) =>
    api.post<{ ok: true }>('/api/finance/daily-reopen', input),
};

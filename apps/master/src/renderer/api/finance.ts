import { api } from './client';
import type { DailyLedger } from './reports';

export type { DailyLedger };

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

  // ─── P&L view (kunlik foyda) ─────────────────────────────────────────
  mealSales: Array<{
    menuItemId: string;
    menuItemName: string;
    categoryId: string;
    categoryName: string;
    isService: boolean;
    qty: number;
    revenue: string;
    cogs: string;
    profit: string;
  }>;
  mealSalesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    qty: number;
    revenue: string;
    cogs: string;
    profit: string;
  }>;
  mealSalesTotal: {
    qty: number;
    revenue: string;
    cogs: string;
    profit: string;
  };
  operatingExpenses: Array<{
    id: string;
    occurredAt: string;
    reason: string;
    amount: string;
    categoryName: string;
    repayable: boolean;
    repayStatus: 'NOT_REPAYABLE' | 'PENDING' | 'PARTIAL' | 'RETURNED' | 'WRITTEN_OFF';
    status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
  }>;
  operatingExpensesTotal: {
    count: number;
    gross: string;
    operating: string;
  };
  ingredientPurchases: Array<{
    id: string;
    occurredAt: string;
    ingredientName: string;
    quantityBuyUnit: string;
    buyUnit: string;
    totalCostUzs: string;
    supplierNote: string | null;
  }>;
  ingredientPurchasesTotal: {
    count: number;
    amount: string;
  };
  debtToday: {
    openedCount: number;
    openedAmount: string;
    collectedCount: number;
    collectedAmount: string;
    lifetimeOutstanding: string;
  };
  pnl: {
    revenue: string;
    cogs: string;
    operatingExpense: string;
    profit: string;
  };
  // Canonical ledger — single source of truth for daily numbers (PRD 13).
  // Prefer reading from here in new components.
  ledger: DailyLedger;
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

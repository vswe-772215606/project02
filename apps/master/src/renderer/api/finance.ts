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

export const financeApi = {
  daily: (date?: string) =>
    api.get<FinanceDaily>(`/api/finance/daily${date ? `?date=${date}` : ''}`),
};

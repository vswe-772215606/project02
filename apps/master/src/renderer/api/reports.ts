import { api } from './client';

export interface ExpenseReportItem {
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
}

export interface DailyReport {
  date: string;
  sales: {
    closedOrders: number;
    canceledOrders: number;
    walkoutOrders: number;
    grossSales: string;
    discounts: string;
    netSales: string;
    debtSales: string;
    serviceCharge: string;
  };
  cashflow: {
    orderCash: string;
    orderCard: string;
    debtRepaymentsCash: string;
    debtRepaymentsCard: string;
    realCashIn: string;
  };
  expenses: {
    gross: string;
    reversal: string;
    net: string;
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      amount: string;
    }>;
    items: ExpenseReportItem[];
  };
  results: {
    salesBasedProfit: string;
    cashflowBasedNet: string;
  };
  checks: {
    salesVsPayments: {
      subtotal: string;
      discounts: string;
      netSales: string;
      serviceCharge: string;
      billedTotal: string;
      paymentTotal: string;
      difference: string;
    };
    expenses: {
      recordedExpense: string;
      reversalAmount: string;
      netExpense: string;
    };
    debts: {
      openedTodayAmount: string;
      repaidTodayAmount: string;
      outstandingTotal: string;
    };
  };
  debtSnapshot: {
    openedTodayCount: number;
    openedTodayAmount: string;
    repaidTodayAmount: string;
    repayments: Array<{
      id: string;
      amount: string;
      method: 'CASH' | 'CARD';
      debtorName: string;
      orderNumber: string;
      paidAt: string;
      receivedByName: string;
    }>;
    outstandingTotal: string;
  };
  perWaiter: Array<{
    waiterId: string;
    waiterName: string;
    orders: number;
    revenue: string;
    serviceEarned: string;
  }>;
  cancellations: Array<{
    orderId: string;
    canceledAt: string;
    canceledBy: string;
    reason: string;
  }>;
  walkouts: Array<{
    orderId: string;
    markedAt: string;
    markedBy: string;
    amount: string;
    reason: string;
  }>;
  ordersTable: Array<{
    orderId: string;
    orderNumber: string;
    at: string;
    tableName: string | null;
    waiterName: string;
    status: 'CLOSED' | 'CANCELED' | 'WALKOUT';
    gross: string;
    discount: string;
    net: string;
    service: string;
    cash: string;
    card: string;
    debt: string;
  }>;
  mealSales: Array<{
    mealName: string;
    categoryName: string | null;
    ordersCount: number;
    qtyOrdered: number;
    grossSales: string;
    avgPerOrder: string;
  }>;
  debtLedger: Array<{
    debtId: string;
    openedAt: string;
    orderNumber: string;
    debtorName: string;
    debtorPhone: string | null;
    orderTotal: string;
    originalAmount: string;
    repaidToday: string;
    totalRepaid: string;
    remainingAmount: string;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
    lastRepaymentAt: string | null;
    openedToday: boolean;
  }>;
}

export interface MonthlyReport {
  month: string;
  totals: {
    closedOrders: number;
    canceledOrders: number;
    walkoutOrders: number;
    grossSales: string;
    discounts: string;
    netSales: string;
    debtSales: string;
    serviceCharge: string;
    realCashIn: string;
    expensesNet: string;
    salesBasedProfit: string;
    cashflowBasedNet: string;
    outstandingDebtEndOfMonth: string;
  };
  daily: DailyReport[];
}

export interface SummaryReport {
  from: string;
  to: string;
  incomes: {
    byMenuCategory: Array<{
      categoryId: string;
      categoryName: string;
      qty: number;
      revenue: string;
      cogs: string;
      profit: string;
    }>;
    totals: {
      qty: number;
      revenue: string;
      cogs: string;
    };
    other: {
      debtRepaid: string;
      expenseReturns: string;
    };
    salesByPaymentMethod: {
      cash: string;
      card: string;
      debt: string;
    };
  };
  pnl: {
    expensesByCategory: Array<{
      categoryId: string;
      categoryName: string;
      amount: string;
    }>;
    revenue: string;
    cogs: string;
    operatingExpense: string;
    profit: string;
  };
  cash: {
    expensesByCategory: Array<{
      categoryId: string;
      categoryName: string;
      amount: string;
    }>;
    salesInflow: string;
    debtRepaid: string;
    expenseReturns: string;
    totalIn: string;
    totalOut: string;
    farq: string;
  };
}

export const reportsApi = {
  getDaily: (date: string) => api.get<DailyReport>(`/api/reports/daily?date=${date}`),
  getMonthly: (month: string) => api.get<MonthlyReport>(`/api/reports/monthly?month=${month}`),
  getSummary: (from: string, to: string) =>
    api.get<SummaryReport>(`/api/reports/summary?from=${from}&to=${to}`),
};

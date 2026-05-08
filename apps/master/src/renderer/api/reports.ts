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
    canceledOrdersGross: string;
    walkoutOrdersGross: string;
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
      mealSalesGross: string;
      mealSalesDifference: string;
      serviceLineTotal: string;
      serviceLineDifference: string;
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
    canceledOrders: number;
    revenue: string;
    serviceEarned: string;
    serviceServings: number;
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
    amountSource?: 'snapshot' | 'derived';
  }>;
  mealSales: Array<{
    mealName: string;
    categoryName: string | null;
    ordersCount: number;
    qtyOrdered: number;
    grossSales: string;
    avgPerOrder: string;
  }>;
  kitchenProduction: Array<{
    mealName: string;
    qtyOrdered: number;
    qtySent: number;
    qtyStarted: number;
    qtyReady: number;
    qtyCanceledBeforeCooking: number;
    qtyCanceledAfterStart: number;
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
  isCurrentMonth: boolean;
  totals: {
    closedOrders: number;
    canceledOrders: number;
    walkoutOrders: number;
    grossSales: string;
    discounts: string;
    netSales: string;
    debtSales: string;
    realCashIn: string;
    expensesNet: string;
    salesBasedProfit: string;
    cashflowBasedNet: string;
    outstandingDebtEndOfMonth: string;
    perWaiter: Array<{
      waiterId: string;
      waiterName: string;
      orders: number;
      canceledOrders: number;
      revenue: string;
      serviceEarned: string;
      serviceServings: number;
    }>;
  };
  daily: DailyReport[];
}

export interface WaiterReport {
  waiterId: string;
  waiterName: string;
  isActive: boolean;
  from: string;
  to: string;
  summary: {
    totalOrders: number;
    totalCanceledOrders: number;
    activeDays: number;
    grossRevenue: string;
    discounts: string;
    netRevenue: string;
    serviceEarned: string;
    serviceServings: number;
    orderCash: string;
    orderCard: string;
    avgOrderValue: string;
  };
  orders: Array<{
    orderId: string;
    orderNumber: string;
    closedAt: string;
    tableName: string | null;
    gross: string;
    discount: string;
    net: string;
    serviceCharge: string;
    cash: string;
    card: string;
  }>;
  canceledOrders: Array<{
    orderId: string;
    orderNumber: string;
    canceledAt: string;
    tableName: string | null;
    gross: string;
    reason: string;
  }>;
}

export const reportsApi = {
  getDaily: (date: string, search?: string) =>
    api.get<DailyReport>(`/api/reports/daily?date=${date}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  getMonthly: (month: string) => api.get<MonthlyReport>(`/api/reports/monthly?month=${month}`),
  getWaiterReport: (waiterId: string, from: string, to: string) =>
    api.get<WaiterReport>(`/api/reports/waiter/${waiterId}?from=${from}&to=${to}`),
};

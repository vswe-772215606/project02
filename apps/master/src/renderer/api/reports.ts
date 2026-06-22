import { api } from './client';

/**
 * Canonical daily ledger DTO (PRD 13). All daily/admin/Telegram surfaces
 * project from this — fields are byte-identical across `daily.ledger`,
 * `finance.daily.ledger`, and the Telegram message formatter.
 *
 * Use this in components instead of the legacy field names where possible.
 * Drill-down details (expense items, debt ledger, ordersTable, etc.) live
 * in their owning surface, not on the canonical ledger.
 */
export interface DailyLedger {
  date: string; // YYYY-MM-DD in Tashkent
  sales: {
    closedCount: number;
    canceledCount: number;
    walkoutCount: number;
    gross: string;
    discount: string;
    netSales: string;       // gross − discount
    serviceCharge: string;
    debtSales: string;
  };
  cashflow: {
    orderCash: string;
    orderCard: string;
    debtRepaidCash: string;
    debtRepaidCard: string;
    expenseReturns: string;
    realCashIn: string;
    // Real cash that left the till (gross − same-day reversals). Cross-day
    // purchase reversals do NOT count here. drawerMovement = realCashIn − cashOut.
    cashOut: string;
    drawerMovement: string;
  };
  outflow: {
    expenseGross: string;
    expenseReversal: string;
    // Reversals whose original was also today — the only ones that offset cash.
    expenseSameDayReversal: string;
    expenseNet: string;
    operatingExpense: string;
    pendingRepayable: string;
    ingredientPurchases: string;
    ingredientPurchasesCount: number;
  };
  pnl: {
    revenue: string;          // = sales.netSales
    cogs: string;
    operatingExpense: string; // = outflow.operatingExpense
    profit: string;           // CANONICAL: revenue − cogs − operatingExpense
  };
  debt: {
    openedTodayCount: number;
    openedTodayAmount: string;
    repaidTodayAmount: string;
    outstandingAsOfEod: string;
  };
  perWaiter: Array<{
    waiterId: string;
    waiterName: string;
    orders: number;
    revenue: string;
    serviceEarned: string;
  }>;
  incidents: {
    walkouts: Array<{
      orderId: string;
      walkoutAt: string;
      walkoutById: string | null;
      walkoutByName: string | null;
      amount: string;
      reason: string;
    }>;
    cancellations: Array<{
      orderId: string;
      canceledAt: string;
      reason: string;
    }>;
  };
  lines: {
    closedOrders: Array<{
      orderId: string;
      orderNumber: string;
      closedAt: string | null;
      tableName: string | null;
      waiterName: string;
      gross: string;
      discount: string;
      net: string;
      service: string;
      cash: string;
      card: string;
      debt: string;
      total: string;
    }>;
    mealSales: Array<{
      menuItemId: string;
      menuItemName: string;
      categoryId: string;
      categoryName: string;
      isService: boolean;
      qty: number;
      grossRevenue: string;
      cogs: string;
      profit: string;
    }>;
    debtRepayments: Array<{
      id: string;
      amount: string;
      method: 'CASH' | 'CARD';
      debtorName: string;
      orderNumber: string;
      paidAt: string;
      receivedByName: string;
    }>;
  };
}

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
    expenseReturns: string;
    realCashIn: string;
    // Cash that genuinely left the till (same-day-reversal aware).
    cashOut: string;
  };
  expenses: {
    gross: string;
    reversal: string;
    // Same-day reversals only — what offsets today's cash-out.
    sameDayReversal: string;
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
      sameDayReversalAmount: string;
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
    // PRD 13: pre-T6 this was always 'unknown'. Now resolved via the new
    // Order.walkoutById column. `markedBy` left for legacy callers; new
    // code should prefer markedById / markedByName.
    markedBy?: string;
    markedById: string | null;
    markedByName: string | null;
    amount: string;
    reason: string;
  }>;
  // Canonical ledger — single source of truth for daily numbers (PRD 13).
  // Prefer reading from here in new components. Legacy fields above are
  // kept as compatibility projections.
  ledger: DailyLedger;
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

/**
 * Per-day row in MonthlyReport.daily — a slimmer projection than the full
 * DailyReport. Post PRD-13 (T8), `monthly()` runs as one range query and
 * emits this compact shape per Tashkent day instead of N×daily().
 */
export interface MonthlyDayRow {
  date: string; // YYYY-MM-DD in Tashkent
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
    expenseReturns: string;
    realCashIn: string;
  };
  expenses: {
    gross: string;
    reversal: string;
    net: string;
    operating: string;
  };
  pnl: {
    revenue: string;
    cogs: string;
    operatingExpense: string;
    profit: string;
  };
  results: {
    // Legacy alias for canonical `pnl.profit` — both are byte-identical
    // since T8 reconciled the formula. Keep for compat; new code should
    // read `pnl.profit`.
    salesBasedProfit: string;
    cashflowBasedNet: string;
  };
  debtSnapshot: {
    outstandingTotal: string;
  };
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
  daily: MonthlyDayRow[];
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
    revenue: string;        // NET food (gross − discount)
    grossRevenue: string;   // gross food, before discount
    discount: string;       // bill-level discount over the range
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

type DailyReport = {
  date: string;
  orders: { closed: number; canceled: number; walkout: number; total: number };
  revenue: { gross: string; discounts: string; net: string };
  serviceCollected: string;
  payments: { cash: string; card: string };
  perWaiter: Array<{
    waiterId: string;
    waiterName: string;
    orders: number;
    revenue: string;
    serviceEarned: string;
  }>;
  cancellations: Array<{ orderId: string; canceledAt: string; canceledBy: string; reason: string }>;
  walkouts: Array<{ orderId: string; markedAt: string; markedBy: string; amount: string; reason: string }>;
};

function zeroDailyReport(date: string): DailyReport {
  return {
    date,
    orders: { closed: 0, canceled: 0, walkout: 0, total: 0 },
    revenue: { gross: '0', discounts: '0', net: '0' },
    serviceCollected: '0',
    payments: { cash: '0', card: '0' },
    perWaiter: [],
    cancellations: [],
    walkouts: [],
  };
}

export const reportsService = {
  async daily(date: string): Promise<DailyReport> {
    return zeroDailyReport(date);
  },

  async monthly(month: string) {
    return {
      ...zeroDailyReport(`${month}-01`),
      daily: [] as DailyReport[],
    };
  },
};

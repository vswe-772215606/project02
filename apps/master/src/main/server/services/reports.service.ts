import { getPrisma } from '../lib/prisma';

export const reportsService = {
  async daily(date: Date) {
    const prisma = getPrisma();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Fetch all orders that ended (CLOSED, WALKOUT, CANCELED) within the day
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { closedAt: { gte: dayStart, lt: dayEnd } },
          { canceledAt: { gte: dayStart, lt: dayEnd } },
          { 
            AND: [
              { status: 'WALKOUT' },
              { updatedAt: { gte: dayStart, lt: dayEnd } }
            ] 
          },
        ],
      },
      include: {
        payments: true,
        waiter: { select: { id: true, fullName: true } },
        appliedDiscount: true,
      },
    });

    // Buckets
    const closed = orders.filter((o) => o.status === 'CLOSED');
    const canceled = orders.filter((o) => o.status === 'CANCELED');
    const walkouts = orders.filter((o) => o.status === 'WALKOUT');

    // Revenue calculations (only from CLOSED orders)
    let gross = 0n;
    let discountTotal = 0n;
    let serviceTotal = 0n;
    let cashTotal = 0n;
    let cardTotal = 0n;

    for (const o of closed) {
      gross += BigInt(o.subtotalSnapshot?.toFixed(0) ?? '0');
      discountTotal += BigInt(o.discountAmountSnapshot?.toFixed(0) ?? '0');
      serviceTotal += BigInt(o.serviceChargeSnapshot?.toFixed(0) ?? '0');
      for (const p of o.payments) {
        const amt = BigInt(p.amount.toFixed(0));
        if (p.method === 'CASH') cashTotal += amt;
        if (p.method === 'CARD') cardTotal += amt;
      }
    }

    const netRevenue = gross - discountTotal;

    // Per-waiter aggregation
    const perWaiterMap = new Map<string, { waiterId: string; waiterName: string; orders: number; revenue: bigint; serviceEarned: bigint }>();
    for (const o of closed) {
      const w = perWaiterMap.get(o.waiterId) ?? {
        waiterId: o.waiterId,
        waiterName: o.waiter.fullName,
        orders: 0,
        revenue: 0n,
        serviceEarned: 0n,
      };
      w.orders += 1;
      w.revenue += BigInt(o.subtotalSnapshot?.toFixed(0) ?? '0') - BigInt(o.discountAmountSnapshot?.toFixed(0) ?? '0');
      w.serviceEarned += BigInt(o.serviceChargeSnapshot?.toFixed(0) ?? '0');
      perWaiterMap.set(o.waiterId, w);
    }

    // Cancellations log
    const cancellationsList = canceled.map((o) => ({
      orderId: o.id,
      canceledAt: o.canceledAt!.toISOString(),
      canceledBy: 'system', // TODO: enrich from audit log if needed
      reason: o.cancelReason ?? '',
    }));

    // Walkouts log
    const walkoutsList = walkouts.map((o) => ({
      orderId: o.id,
      markedAt: o.updatedAt.toISOString(),
      markedBy: o.approvedById ?? 'unknown',
      amount: o.totalSnapshot?.toString() ?? '0',
      reason: o.cancelReason ?? '',
    }));

    return {
      date: dayStart.toISOString().slice(0, 10),
      orders: {
        closed: closed.length,
        canceled: canceled.length,
        walkout: walkouts.length,
        total: orders.length,
      },
      revenue: {
        gross: gross.toString(),
        discounts: discountTotal.toString(),
        net: netRevenue.toString(),
      },
      serviceCollected: serviceTotal.toString(),
      payments: {
        cash: cashTotal.toString(),
        card: cardTotal.toString(),
      },
      perWaiter: Array.from(perWaiterMap.values()).map((w) => ({
        ...w,
        revenue: w.revenue.toString(),
        serviceEarned: w.serviceEarned.toString(),
      })),
      cancellations: cancellationsList,
      walkouts: walkoutsList,
    };
  },

  async monthly(monthStart: Date) {
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Compute per-day reports for the whole month
    const days: Array<any> = [];
    const cursor = new Date(monthStart);
    while (cursor < monthEnd) {
      days.push(await this.daily(new Date(cursor)));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Aggregate
    const agg = days.reduce(
      (acc, d) => ({
        ordersClosed: acc.ordersClosed + d.orders.closed,
        ordersCanceled: acc.ordersCanceled + d.orders.canceled,
        ordersWalkout: acc.ordersWalkout + d.orders.walkout,
        gross: acc.gross + BigInt(d.revenue.gross),
        discounts: acc.discounts + BigInt(d.revenue.discounts),
        net: acc.net + BigInt(d.revenue.net),
        service: acc.service + BigInt(d.serviceCollected),
        cash: acc.cash + BigInt(d.payments.cash),
        card: acc.card + BigInt(d.payments.card),
      }),
      { ordersClosed: 0, ordersCanceled: 0, ordersWalkout: 0, gross: 0n, discounts: 0n, net: 0n, service: 0n, cash: 0n, card: 0n },
    );

    return {
      month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      totals: {
        ordersClosed: agg.ordersClosed,
        ordersCanceled: agg.ordersCanceled,
        ordersWalkout: agg.ordersWalkout,
        gross: agg.gross.toString(),
        discounts: agg.discounts.toString(),
        net: agg.net.toString(),
        serviceCollected: agg.service.toString(),
        payments: { cash: agg.cash.toString(), card: agg.card.toString() },
      },
      daily: days,
    };
  },
};

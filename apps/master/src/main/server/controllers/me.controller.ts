import { NextFunction, Request, Response } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPrisma } from '../lib/prisma';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const todayStatsQuery = z.object({
  date: z.string().regex(ISO_DATE).optional(),
});

const rangeStatsQuery = z.object({
  from: z.string().regex(ISO_DATE),
  to: z.string().regex(ISO_DATE),
});

// Local YYYY-MM-DD for "today" — the staff's calendar day, not UTC.
// Avoids the bug where defaulting to `new Date().toISOString().slice(0, 10)`
// returns yesterday's date for the first few hours of the morning in UTC+5.
function localTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Waiter-scoped stats endpoints. Lets a waiter see their own service charge
 * earned etc. without exposing the admin /api/users/today-stats endpoint.
 */
export const meController = {
  async todayStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = todayStatsQuery.parse(req.query);
      const dayKey = date ?? localTodayKey();
      const dayStart = new Date(`${dayKey}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const userId = req.user!.id;

      const [closedOrders, canceledOrders, walkoutOrders] = await Promise.all([
        getPrisma().order.findMany({
          where: {
            status: OrderStatus.CLOSED,
            closedAt: { gte: dayStart, lte: dayEnd },
            waiterId: userId,
          },
          select: {
            id: true,
            totalSnapshot: true,
            serviceChargeSnapshot: true,
            subtotalSnapshot: true,
            discountAmountSnapshot: true,
          },
        }),
        getPrisma().order.count({
          where: {
            status: OrderStatus.CANCELED,
            canceledAt: { gte: dayStart, lte: dayEnd },
            waiterId: userId,
          },
        }),
        getPrisma().order.count({
          where: {
            status: OrderStatus.WALKOUT,
            updatedAt: { gte: dayStart, lte: dayEnd },
            waiterId: userId,
          },
        }),
      ]);

      let foodRevenue = new Prisma.Decimal(0);
      let serviceEarned = new Prisma.Decimal(0);
      let totalBilled = new Prisma.Decimal(0);

      for (const order of closedOrders) {
        const subtotal = order.subtotalSnapshot ?? new Prisma.Decimal(0);
        const discount = order.discountAmountSnapshot ?? new Prisma.Decimal(0);
        foodRevenue = foodRevenue.plus(subtotal.minus(discount));
        serviceEarned = serviceEarned.plus(order.serviceChargeSnapshot ?? new Prisma.Decimal(0));
        totalBilled = totalBilled.plus(order.totalSnapshot ?? new Prisma.Decimal(0));
      }

      res.json({
        date: dayKey,
        userId,
        orderCount: closedOrders.length,
        ordersClosed: closedOrders.length,
        ordersCanceled: canceledOrders,
        ordersWalkout: walkoutOrders,
        foodRevenue: foodRevenue.toFixed(0),
        serviceEarned: serviceEarned.toFixed(0),
        totalBilled: totalBilled.toFixed(0),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Per-day breakdown for the requesting waiter over a date range.
   * Used by the mobile calendar to show which days have activity and
   * to populate the day-detail card without N requests.
   *
   * Capped to 92 days to keep payload bounded.
   */
  async rangeStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = rangeStatsQuery.parse(req.query);
      const dayStart = new Date(`${from}T00:00:00`);
      const dayEnd = new Date(`${to}T23:59:59.999`);

      if (dayEnd < dayStart) {
        res.status(400).json({ error: { code: 'INVALID_RANGE', message: 'to must be >= from' } });
        return;
      }

      const spanDays = Math.round((dayEnd.getTime() - dayStart.getTime()) / 86400000);
      if (spanDays > 92) {
        res.status(400).json({ error: { code: 'RANGE_TOO_LARGE', message: 'Range capped at 92 days' } });
        return;
      }

      const userId = req.user!.id;

      const closedOrders = await getPrisma().order.findMany({
        where: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: dayStart, lte: dayEnd },
          waiterId: userId,
        },
        select: {
          closedAt: true,
          serviceChargeSnapshot: true,
        },
      });

      type Bucket = { ordersClosed: number; serviceEarned: Prisma.Decimal };
      const buckets = new Map<string, Bucket>();

      for (const o of closedOrders) {
        if (!o.closedAt) continue;
        const key = localDayKey(o.closedAt);
        const b = buckets.get(key) ?? { ordersClosed: 0, serviceEarned: new Prisma.Decimal(0) };
        b.ordersClosed += 1;
        b.serviceEarned = b.serviceEarned.plus(o.serviceChargeSnapshot ?? new Prisma.Decimal(0));
        buckets.set(key, b);
      }

      const days: Array<{ date: string; ordersClosed: number; serviceEarned: string }> = [];
      const cursor = new Date(dayStart);
      cursor.setHours(0, 0, 0, 0);
      const stop = new Date(dayEnd);
      stop.setHours(0, 0, 0, 0);
      while (cursor <= stop) {
        const key = localDayKey(cursor);
        const b = buckets.get(key);
        days.push({
          date: key,
          ordersClosed: b?.ordersClosed ?? 0,
          serviceEarned: (b?.serviceEarned ?? new Prisma.Decimal(0)).toFixed(0),
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      let totalOrders = 0;
      let totalService = new Prisma.Decimal(0);
      for (const d of days) {
        totalOrders += d.ordersClosed;
        totalService = totalService.plus(d.serviceEarned);
      }

      res.json({
        from,
        to,
        userId,
        days,
        totalOrders,
        totalServiceEarned: totalService.toFixed(0),
      });
    } catch (error) {
      next(error);
    }
  },
};

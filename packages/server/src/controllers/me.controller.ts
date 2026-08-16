import { NextFunction, Request, Response } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPrisma } from '../lib/prisma';
import { localDayKey, localDayRangeFor, parseLocalDay } from '../lib/time';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const todayStatsQuery = z.object({
  date: z.string().regex(ISO_DATE).optional(),
});

const rangeStatsQuery = z.object({
  from: z.string().regex(ISO_DATE),
  to: z.string().regex(ISO_DATE),
});

/**
 * Waiter-scoped stats endpoints. Lets a waiter see their own service charge
 * earned etc. without exposing the admin /api/users/today-stats endpoint.
 */
export const meController = {
  async todayStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = todayStatsQuery.parse(req.query);
      const dayKey = date ?? localDayKey();
      const { start: dayStart, end: dayEnd } = localDayRangeFor(dayKey);

      const userId = req.user!.id;

      const [closedOrders, canceledOrders] = await Promise.all([
        getPrisma().order.findMany({
          where: {
            status: OrderStatus.CLOSED,
            closedAt: { gte: dayStart, lt: dayEnd },
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
            canceledAt: { gte: dayStart, lt: dayEnd },
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
      const dayStart = parseLocalDay(from);
      // Range is half-open [dayStart, rangeEnd) where rangeEnd = start of the
      // day AFTER `to` — so `to` itself is included.
      const rangeEnd = localDayRangeFor(to).end;

      if (rangeEnd <= dayStart) {
        res.status(400).json({ error: { code: 'INVALID_RANGE', message: 'to must be >= from' } });
        return;
      }

      const spanDays = Math.round((rangeEnd.getTime() - dayStart.getTime()) / 86400000);
      if (spanDays > 92) {
        res.status(400).json({ error: { code: 'RANGE_TOO_LARGE', message: 'Range capped at 92 days' } });
        return;
      }

      const userId = req.user!.id;

      const closedOrders = await getPrisma().order.findMany({
        where: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: dayStart, lt: rangeEnd },
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
      // Walk the [dayStart, rangeEnd) window one Tashkent day at a time. Adding
      // 24h to a Tashkent-anchored midnight gives the next Tashkent midnight
      // (no DST in Tashkent, so this is exact).
      const MS_PER_DAY = 86_400_000;
      for (let cursor = dayStart; cursor < rangeEnd; cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
        const key = localDayKey(cursor);
        const b = buckets.get(key);
        days.push({
          date: key,
          ordersClosed: b?.ordersClosed ?? 0,
          serviceEarned: (b?.serviceEarned ?? new Prisma.Decimal(0)).toFixed(0),
        });
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

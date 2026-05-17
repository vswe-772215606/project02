import { NextFunction, Request, Response } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPrisma } from '../lib/prisma';

const todayStatsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Waiter-scoped today stats. Lets a waiter see their own service charge earned
 * etc. without exposing the admin /api/users/today-stats endpoint.
 */
export const meController = {
  async todayStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = todayStatsQuery.parse(req.query);
      const dayStart = new Date(`${date ?? new Date().toISOString().slice(0, 10)}T00:00:00`);
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
        date: dayStart.toISOString().slice(0, 10),
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
};

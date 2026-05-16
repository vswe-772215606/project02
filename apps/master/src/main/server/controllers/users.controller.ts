import { OrderStatus, UserRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { toPublicUser } from '../lib/public-user';
import { userService } from '../services/user.service';

const todayStatsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createSchema = z.object({
  role: z.nativeEnum(UserRole),
  fullName: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  pin: z.string().optional(),
});

const updateSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  fullName: z.string().optional(),
  username: z.string().nullable().optional(),
  password: z.string().optional(),
  pin: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const usersController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      res.json((await userService.list(includeInactive)).map(toPublicUser));
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      const user = await userService.create(body, {
        id: req.user!.id,
        role: req.user!.role as UserRole,
      });
      res.status(201).json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateSchema.parse(req.body);
      const user = await userService.update(req.params.id, body, {
        id: req.user!.id,
        role: req.user!.role as UserRole,
      });
      res.json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  },

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(toPublicUser(await userService.deactivate(req.params.id, req.user!.id)));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Lightweight per-waiter day stats — for admin "Hodimlar bo'limi" view.
   * Returns: orders count + bill total + service-charge earned for each WAITER,
   * based on orders CLOSED on the given date (default: today, local).
   */
  async todayStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = todayStatsQuery.parse(req.query);
      const dayStart = new Date(`${date ?? new Date().toISOString().slice(0, 10)}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const closedOrders = await getPrisma().order.findMany({
        where: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: dayStart, lte: dayEnd },
        },
        include: {
          waiter: { select: { id: true, fullName: true } },
        },
      });

      type Agg = {
        waiterId: string;
        waiterName: string;
        orders: number;
        billedTotal: Prisma.Decimal;
        serviceEarned: Prisma.Decimal;
      };
      const map = new Map<string, Agg>();

      for (const order of closedOrders) {
        const agg = map.get(order.waiterId) ?? {
          waiterId: order.waiterId,
          waiterName: order.waiter.fullName,
          orders: 0,
          billedTotal: new Prisma.Decimal(0),
          serviceEarned: new Prisma.Decimal(0),
        };
        agg.orders += 1;
        agg.billedTotal = agg.billedTotal.plus(order.totalSnapshot ?? new Prisma.Decimal(0));
        agg.serviceEarned = agg.serviceEarned.plus(order.serviceChargeSnapshot ?? new Prisma.Decimal(0));
        map.set(order.waiterId, agg);
      }

      res.json({
        date: dayStart.toISOString().slice(0, 10),
        items: Array.from(map.values())
          .sort((a, b) => Number(b.billedTotal) - Number(a.billedTotal))
          .map((agg) => ({
            waiterId: agg.waiterId,
            waiterName: agg.waiterName,
            orders: agg.orders,
            billedTotal: agg.billedTotal.toFixed(0),
            serviceEarned: agg.serviceEarned.toFixed(0),
          })),
      });
    } catch (error) {
      next(error);
    }
  },
};

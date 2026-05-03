import { OrderStatus, PaymentMethod, UserRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { orderService } from '../services/order.service';

const createSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  tableId: z.string().nullable().optional(),
});

const listQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  mine: z.union([z.literal('true'), z.literal('false')]).optional(),
  date: z.string().optional(),
});

const addItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

const addComboSchema = z.object({
  comboId: z.string().min(1),
});

const noteSchema = z.object({
  notes: z.string(),
});

const reasonSchema = z.object({
  reason: z.string().optional(),
});

const transferSchema = z.object({
  tableId: z.string().min(1),
});

const updateLineQuantitySchema = z.object({
  quantity: z.number().int().positive(),
});

const approveSchema = z.object({
  discountId: z.string().optional(),
  serviceChargeWaived: z.boolean().default(false),
});

const markPaidSchema = z.object({
  payments: z.array(z.object({
    method: z.nativeEnum(PaymentMethod),
    amount: z.union([z.number().int(), z.string().min(1)]),
    reference: z.string().optional(),
  })).min(1),
});

const markWalkoutSchema = z.object({
  reason: z.string().min(1),
});

function requester(req: Request) {
  return {
    id: req.user!.id,
    role: req.user!.role as UserRole,
  };
}

export const ordersController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      const order = await orderService.createDraft({
        waiterId: req.user!.id,
        orderType: body.orderType,
        tableId: body.tableId ?? null,
      });
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listQuerySchema.parse(req.query);
      const orders = await orderService.list({
        requestingUser: requester(req),
        status: query.status,
        mine: query.mine === 'true',
        date: query.date ? new Date(query.date) : undefined,
      });
      res.json(orders);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await orderService.getById(req.params.id, requester(req)));
    } catch (error) {
      next(error);
    }
  },

  async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const body = addItemSchema.parse(req.body);
      res.status(201).json(await orderService.addLine({
        orderId: req.params.id,
        waiterId: req.user!.id,
        menuItemId: body.menuItemId,
        quantity: body.quantity,
        notes: body.notes,
      }));
    } catch (error) {
      next(error);
    }
  },

  async addCombo(req: Request, res: Response, next: NextFunction) {
    try {
      const body = addComboSchema.parse(req.body);
      res.status(201).json(await orderService.addCombo({
        orderId: req.params.id,
        waiterId: req.user!.id,
        comboId: body.comboId,
      }));
    } catch (error) {
      next(error);
    }
  },

  async updateLineQuantity(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateLineQuantitySchema.parse(req.body);
      res.json(await orderService.updateLineQuantity({
        orderId: req.params.id,
        waiterId: req.user!.id,
        lineId: req.params.lineId,
        quantity: body.quantity,
      }));
    } catch (error) {
      next(error);
    }
  },

  async editLineNote(req: Request, res: Response, next: NextFunction) {
    try {
      const body = noteSchema.parse(req.body);
      res.json(await orderService.editLineNote({
        orderId: req.params.id,
        waiterId: req.user!.id,
        lineId: req.params.lineId,
        notes: body.notes,
      }));
    } catch (error) {
      next(error);
    }
  },

  async cancelLine(req: Request, res: Response, next: NextFunction) {
    try {
      const body = reasonSchema.parse(req.body);
      res.json(await orderService.cancelLine({
        orderId: req.params.id,
        requestingUser: requester(req),
        lineId: req.params.lineId,
        reason: body.reason,
      }));
    } catch (error) {
      next(error);
    }
  },

  async send(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await orderService.send({
        orderId: req.params.id,
        waiterId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async transfer(req: Request, res: Response, next: NextFunction) {
    try {
      const body = transferSchema.parse(req.body);
      res.json(await orderService.transfer({
        orderId: req.params.id,
        requestingUser: requester(req),
        newTableId: body.tableId,
      }));
    } catch (error) {
      next(error);
    }
  },

  async requestBill(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await orderService.requestBill({
        orderId: req.params.id,
        waiterId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      res.json(await orderService.cancelOrder({
        orderId: req.params.id,
        requestingUser: requester(req),
        reason: body.reason,
      }));
    } catch (error) {
      next(error);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const body = approveSchema.parse(req.body);
      res.json(await orderService.approve({
        orderId: req.params.id,
        adminUserId: req.user!.id,
        discountId: body.discountId,
        serviceChargeWaived: body.serviceChargeWaived,
      }));
    } catch (error) {
      next(error);
    }
  },

  async markPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const body = markPaidSchema.parse(req.body);
      res.json(await orderService.markPaid({
        orderId: req.params.id,
        adminUserId: req.user!.id,
        payments: body.payments,
      }));
    } catch (error) {
      next(error);
    }
  },

  async markWalkout(req: Request, res: Response, next: NextFunction) {
    try {
      const body = markWalkoutSchema.parse(req.body);
      res.json(await orderService.markWalkout({
        orderId: req.params.id,
        adminUserId: req.user!.id,
        reason: body.reason,
      }));
    } catch (error) {
      next(error);
    }
  },

  async reprintBill(req: Request, res: Response, next: NextFunction) {
    try {
      const body = reasonSchema.parse(req.body);
      res.json(await orderService.reprintBill({
        orderId: req.params.id,
        requestingUserId: req.user!.id,
        reason: body.reason,
      }));
    } catch (error) {
      next(error);
    }
  },
};

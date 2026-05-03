import { KitchenTicketStatus, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { kitchenRepo } from '../repositories/kitchen.repo';
import { printService } from './print.service';

export const kitchenService = {
  async listActive() {
    return kitchenRepo.listActive();
  },

  async getById(id: string) {
    const ticket = await kitchenRepo.findByIdWithLines(id);
    if (!ticket) {
      throw Errors.NotFound('Kitchen ticket');
    }
    return ticket;
  },

  async setStatus(input: {
    ticketId: string;
    kitchenUserId: string;
    status: KitchenTicketStatus.IN_PROGRESS | KitchenTicketStatus.READY;
  }) {
    return withEmitContext(async () => {
      const ticket = await kitchenRepo.findByIdWithLines(input.ticketId);
      if (!ticket) {
        throw Errors.NotFound('Kitchen ticket');
      }

      const terminalOrderStatuses = ['CANCELED', 'CLOSED', 'WALKOUT'];
      if (terminalOrderStatuses.includes(ticket.order.status)) {
        throw Errors.IllegalStateTransition(ticket.order.status, input.status);
      }

      const updated = await getPrisma().$transaction(async (tx) => {
        let next;
        if (input.status === KitchenTicketStatus.IN_PROGRESS) {
          if (ticket.status !== KitchenTicketStatus.PENDING) {
            throw Errors.IllegalStateTransition(ticket.status, input.status);
          }
          next = await kitchenRepo.setStarted(input.ticketId, tx);
        } else {
          if (ticket.status !== KitchenTicketStatus.IN_PROGRESS) {
            throw Errors.IllegalStateTransition(ticket.status, input.status);
          }
          next = await kitchenRepo.setReady(input.ticketId, tx);
        }

        if (!next) {
          throw Errors.IllegalStateTransition(ticket.status, input.status);
        }

        deferEmit('kitchen', 'ticket:statusChanged', {
          ticketId: input.ticketId,
          status: input.status,
        });
        deferEmit(`waiter:${ticket.order.waiter.id}`, 'ticket:statusChanged', {
          ticketId: input.ticketId,
          status: input.status,
        });

        return next;
      });

      await flushDeferredEmits();
      return updated;
    });
  },

  async cancelTicket(input: { ticketId: string; adminUserId: string; reason: string }, tx?: Prisma.TransactionClient) {
    const ticket = await kitchenRepo.findById(input.ticketId, tx);
    if (!ticket) {
      throw Errors.NotFound('Kitchen ticket');
    }

    return kitchenRepo.setCanceled(input.ticketId, tx);
  },

  async reprint(ticketId: string, actorUserId: string) {
    await this.getById(ticketId);
    const job = await printService.reprintKitchenTicket(ticketId, actorUserId);
    return job ?? { ok: true, skipped: true };
  },
};

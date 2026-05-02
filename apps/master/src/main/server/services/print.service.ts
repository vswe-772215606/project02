import { Prisma } from '@prisma/client';

type PrintableOrder = {
  id: string;
  totalSnapshot: Prisma.Decimal | null;
};

type ReprintableOrder = {
  id: string;
};

export const printService = {
  async printBill(order: PrintableOrder): Promise<void> {
    console.log(`[print-stub] BILL for order ${order.id} (total=${order.totalSnapshot})`);
  },

  async tryPrintKitchenTicket(ticketId: string): Promise<void> {
    console.log(`[print-stub] KITCHEN_TICKET for ticket ${ticketId}`);
  },

  async reprintBill(order: ReprintableOrder): Promise<void> {
    console.log(`[print-stub] BILL_REPRINT for order ${order.id}`);
  },
};

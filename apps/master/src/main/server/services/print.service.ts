import { execFile } from 'child_process';
import { PrintJobType, Prisma } from '@prisma/client';
import { promisify } from 'util';
import { Errors } from '../lib/errors';
import { printQueue } from '../lib/print-queue';
import { kitchenRepo } from '../repositories/kitchen.repo';
import { printJobRepo } from '../repositories/printJob.repo';
import { settingsService } from './settings.service';
import { resolveBinaryPath } from '../printer/binary-resolver';
import { buildBillArgs } from '../printer/receipt-builder';
import { buildKitchenTicketArgs } from '../printer/kitchen-ticket-builder';

const execFileAsync = promisify(execFile);

type PrintableOrder = {
  id: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  totalSnapshot: Prisma.Decimal | null;
  subtotalSnapshot: Prisma.Decimal | null;
  discountAmountSnapshot: Prisma.Decimal | null;
  approvedAt: Date | null;
  lines: Array<{
    id: string;
    isCanceled: boolean;
    nameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: Prisma.Decimal;
  }>;
  table: {
    id: string;
    name: string;
  } | null;
  appliedDiscount: {
    id: string;
    name: string;
  } | null;
  approvedById?: string | null;
};

type PrintExecutionInput = {
  printerName: string;
  args: string[];
  linuxLabel: string;
};

async function executeBinary(input: PrintExecutionInput): Promise<void> {
  if (process.platform === 'linux') {
    console.log(`[print-linux-stub] ${input.linuxLabel}`, {
      printerName: input.printerName,
      args: input.args,
    });
    return;
  }

  if (process.platform !== 'win32') {
    console.log(`[print-platform-stub] ${input.linuxLabel}`, {
      platform: process.platform,
      printerName: input.printerName,
      args: input.args,
    });
    return;
  }

  const binaryPath = resolveBinaryPath();
  if (!binaryPath) {
    throw Errors.PrintFailed('Receipt binary not found');
  }

  await execFileAsync(binaryPath, [input.printerName, ...input.args], {
    timeout: 15000,
    windowsHide: true,
  });
}

async function runQueuedJob(options: {
  jobId: string;
  printerName: string;
  args: string[];
  linuxLabel: string;
  blocking: boolean;
}) {
  const task = async () => {
    await printJobRepo.incrementAttempts(options.jobId);
    try {
      await executeBinary({
        printerName: options.printerName,
        args: options.args,
        linuxLabel: options.linuxLabel,
      });
      await printJobRepo.markSuccess(options.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown print error';
      await printJobRepo.markFailed(options.jobId, message);
      if (options.blocking) {
        throw Errors.PrintFailed(message);
      }
      console.error('[printService] non-blocking print failed', error);
    }
  };

  if (options.blocking) {
    await printQueue.add(task);
    return printJobRepo.findById(options.jobId);
  }

  await printQueue.add(task).catch((error: unknown) => {
    console.error('[printService] queued print failed', error);
  });
  return printJobRepo.findById(options.jobId);
}

function getStoreHeading(): string {
  return settingsService.get('store_heading') || 'Chayxana';
}

export const printService = {
  async printBill(order: PrintableOrder) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
      throw Errors.PrintFailed('Admin printer not configured');
    }

    const args = buildBillArgs(order, { storeHeading: getStoreHeading() });
    const job = await printJobRepo.create({
      type: PrintJobType.BILL,
      printerName,
      payload: {
        orderId: order.id,
      },
      order: {
        connect: { id: order.id },
      },
      triggeredBy: order.approvedById
        ? {
            connect: { id: order.approvedById },
          }
        : undefined,
    });

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `BILL order=${order.id}`,
      blocking: true,
    });
  },

  async tryPrintKitchenTicket(ticketId: string) {
    if (settingsService.get('kitchen_printer_enabled') !== 'true') {
      return null;
    }

    const printerName = settingsService.get('kitchen_printer_name') || '';
    if (!printerName.trim()) {
      return null;
    }

    const ticket = await kitchenRepo.findByIdWithLines(ticketId);
    if (!ticket) {
      throw Errors.NotFound('Kitchen ticket');
    }

    const heading = ticket.order.table?.name ?? 'OSHXONA';
    const args = buildKitchenTicketArgs(ticket, { heading });
    const job = await printJobRepo.create({
      type: PrintJobType.KITCHEN_TICKET,
      printerName,
      payload: {
        ticketId,
      },
      ticket: {
        connect: { id: ticketId },
      },
    });

    await runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `KITCHEN_TICKET ticket=${ticketId}`,
      blocking: false,
    });

    return printJobRepo.findById(job.id);
  },

  async reprintBill(order: PrintableOrder, requestingUserId?: string) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
      throw Errors.PrintFailed('Admin printer not configured');
    }

    const args = buildBillArgs(order, { storeHeading: getStoreHeading() });
    const job = await printJobRepo.create({
      type: PrintJobType.BILL_REPRINT,
      printerName,
      payload: {
        orderId: order.id,
      },
      order: {
        connect: { id: order.id },
      },
      triggeredBy: requestingUserId
        ? {
            connect: { id: requestingUserId },
          }
        : undefined,
    });

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `BILL_REPRINT order=${order.id}`,
      blocking: true,
    });
  },

  async reprintKitchenTicket(ticketId: string, requestingUserId: string) {
    if (settingsService.get('kitchen_printer_enabled') !== 'true') {
      return null;
    }

    const printerName = settingsService.get('kitchen_printer_name') || '';
    if (!printerName.trim()) {
      return null;
    }

    const ticket = await kitchenRepo.findByIdWithLines(ticketId);
    if (!ticket) {
      throw Errors.NotFound('Kitchen ticket');
    }

    const heading = ticket.order.table?.name ?? 'OSHXONA';
    const args = buildKitchenTicketArgs(ticket, { heading });
    const job = await printJobRepo.create({
      type: PrintJobType.TICKET_REPRINT,
      printerName,
      payload: {
        ticketId,
      },
      ticket: {
        connect: { id: ticketId },
      },
      triggeredBy: {
        connect: { id: requestingUserId },
      },
    });

    await runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `TICKET_REPRINT ticket=${ticketId}`,
      blocking: false,
    });

    return printJobRepo.findById(job.id);
  },
};

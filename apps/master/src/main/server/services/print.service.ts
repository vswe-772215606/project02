import { execFile } from 'child_process';
import { PrintJobType, Prisma } from '@prisma/client';
import { promisify } from 'util';
import { Errors } from '../lib/errors';
import { printLog } from '../lib/print-logger';
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
  label: string;
};

async function executeBinary(input: PrintExecutionInput): Promise<void> {
  if (process.platform === 'linux') {
    printLog.info(`[execute] stub/linux label="${input.label}" printer="${input.printerName}"`);
    console.log(`[print-linux-stub] ${input.label}`, {
      printerName: input.printerName,
      args: input.args,
    });
    return;
  }

  if (process.platform !== 'win32') {
    printLog.info(`[execute] stub/${process.platform} label="${input.label}" printer="${input.printerName}"`);
    console.log(`[print-platform-stub] ${input.label}`, {
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

  printLog.info(`[execute] label="${input.label}" printer="${input.printerName}" binary="${binaryPath}"`);

  await execFileAsync(binaryPath, [input.printerName, ...input.args], {
    timeout: 15000,
    windowsHide: true,
  });
}

async function runQueuedJob(options: {
  jobId: string;
  printerName: string;
  args: string[];
  label: string;
  blocking: boolean;
}) {
  const task = async () => {
    printLog.info(`[job:start] id=${options.jobId} label="${options.label}" printer="${options.printerName}"`);
    await printJobRepo.incrementAttempts(options.jobId);
    try {
      await executeBinary({
        printerName: options.printerName,
        args: options.args,
        label: options.label,
      });
      await printJobRepo.markSuccess(options.jobId);
      printLog.info(`[job:ok] id=${options.jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown print error';
      await printJobRepo.markFailed(options.jobId, message);
      printLog.error(`[job:fail] id=${options.jobId} error="${message}"`);
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

function getStorePhone(): string | undefined {
  return settingsService.get('store_phone');
}

function getStoreAddress(): string | undefined {
  return settingsService.get('store_address');
}

export const printService = {
  async printBill(order: PrintableOrder) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
      printLog.error(`[printBill] SKIP orderId=${order.id} reason="admin printer not configured"`);
      throw Errors.PrintFailed('Admin printer not configured');
    }

    const args = buildBillArgs(order, {
      storeHeading: getStoreHeading(),
      storePhone: getStorePhone(),
      storeAddress: getStoreAddress(),
    });
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

    printLog.info(`[printBill] jobId=${job.id} orderId=${order.id} printer="${printerName}"`);

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      label: `BILL order=${order.id}`,
      blocking: true,
    });
  },

  async tryPrintKitchenTicket(ticketId: string) {
    if (settingsService.get('kitchen_printer_enabled') !== 'true') {
      printLog.info(`[tryPrintKitchenTicket] SKIP ticketId=${ticketId} reason="kitchen printer disabled"`);
      return null;
    }

    const printerName = settingsService.get('kitchen_printer_name') || '';
    if (!printerName.trim()) {
      printLog.info(`[tryPrintKitchenTicket] SKIP ticketId=${ticketId} reason="kitchen printer name not configured"`);
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

    printLog.info(`[tryPrintKitchenTicket] jobId=${job.id} ticketId=${ticketId} printer="${printerName}"`);

    await runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      label: `KITCHEN_TICKET ticket=${ticketId}`,
      blocking: false,
    });

    return printJobRepo.findById(job.id);
  },

  async reprintBill(order: PrintableOrder, requestingUserId?: string) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
      printLog.error(`[reprintBill] SKIP orderId=${order.id} reason="admin printer not configured"`);
      throw Errors.PrintFailed('Admin printer not configured');
    }

    const args = buildBillArgs(order, {
      storeHeading: getStoreHeading(),
      storePhone: getStorePhone(),
      storeAddress: getStoreAddress(),
    });
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

    printLog.info(`[reprintBill] jobId=${job.id} orderId=${order.id} printer="${printerName}"`);

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      label: `BILL_REPRINT order=${order.id}`,
      blocking: true,
    });
  },

  async reprintKitchenTicket(ticketId: string, requestingUserId: string) {
    if (settingsService.get('kitchen_printer_enabled') !== 'true') {
      printLog.info(`[reprintKitchenTicket] SKIP ticketId=${ticketId} reason="kitchen printer disabled"`);
      return null;
    }

    const printerName = settingsService.get('kitchen_printer_name') || '';
    if (!printerName.trim()) {
      printLog.info(`[reprintKitchenTicket] SKIP ticketId=${ticketId} reason="kitchen printer name not configured"`);
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

    printLog.info(`[reprintKitchenTicket] jobId=${job.id} ticketId=${ticketId} printer="${printerName}"`);

    await runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      label: `TICKET_REPRINT ticket=${ticketId}`,
      blocking: false,
    });

    return printJobRepo.findById(job.id);
  },
};

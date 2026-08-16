import { PrintJobType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { printQueue } from '../lib/print-queue';
import { getPrinterExecutor } from '../lib/printer-executor';
import { printJobRepo } from '../repositories/printJob.repo';
import { settingsService } from './settings.service';
import { buildBillArgs } from '../printer/receipt-builder';

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
  await getPrinterExecutor()({
    printerName: input.printerName,
    args: input.args,
    label: input.linuxLabel,
  });
}

type Tx = Prisma.TransactionClient;

async function runQueuedJob(options: {
  jobId: string;
  printerName: string;
  args: string[];
  linuxLabel: string;
  blocking: boolean;
  tx?: Tx;
}) {
  const task = async () => {
    await printJobRepo.incrementAttempts(options.jobId, options.tx);
    try {
      await executeBinary({
        printerName: options.printerName,
        args: options.args,
        linuxLabel: options.linuxLabel,
      });
      await printJobRepo.markSuccess(options.jobId, options.tx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown print error';
      await printJobRepo.markFailed(options.jobId, message, options.tx);
      if (options.blocking) {
        throw Errors.PrintFailed(message);
      }
      console.error('[printService] non-blocking print failed', error);
    }
  };

  if (options.blocking) {
    await printQueue.add(task);
    return printJobRepo.findById(options.jobId, options.tx);
  }

  await printQueue.add(task).catch((error: unknown) => {
    console.error('[printService] queued print failed', error);
  });
  return printJobRepo.findById(options.jobId, options.tx);
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
  async printBill(order: PrintableOrder, tx?: Tx) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
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
    }, tx);

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `BILL order=${order.id}`,
      blocking: true,
      tx,
    });
  },

  async reprintBill(order: PrintableOrder, requestingUserId?: string) {
    const printerName = settingsService.get('admin_printer_name') || '';
    if (!printerName.trim()) {
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

    return runQueuedJob({
      jobId: job.id,
      printerName,
      args,
      linuxLabel: `BILL_REPRINT order=${order.id}`,
      blocking: true,
    });
  },
};

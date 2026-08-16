/**
 * How a rendered receipt reaches a printer.
 *
 * The server no longer runs on the machine the printer is attached to, so it
 * cannot spawn receipt.exe itself. Slice 2 registers an executor that hands the
 * job to the print agent at the chayxana. Until then the default records the
 * attempt and succeeds, which is exactly what the old non-Windows path did.
 */
export type PrinterExecutor = (input: {
  printerName: string;
  args: string[];
  label: string;
}) => Promise<void>;

const noopExecutor: PrinterExecutor = async (input) => {
  console.log('[printer-executor] no executor registered', {
    printerName: input.printerName,
    label: input.label,
  });
};

let executor: PrinterExecutor = noopExecutor;

export function setPrinterExecutor(next: PrinterExecutor): void {
  executor = next;
}

export function getPrinterExecutor(): PrinterExecutor {
  return executor;
}

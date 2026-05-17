type SavePdfResult = {
  saved: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
};

type ChayxanaBridge = {
  saveFinancePdf: (payload: { defaultName: string; title?: string }) => Promise<SavePdfResult>;
};

function getBridge(): ChayxanaBridge | null {
  const w = window as unknown as { chayxana?: ChayxanaBridge };
  return w.chayxana ?? null;
}

/**
 * Save the current view as a PDF using Electron's printToPDF when available
 * (admin desktop app), or fall back to the browser's native print dialog
 * (which lets the user pick "Save as PDF" themselves).
 *
 * The page is responsible for having the appropriate `@media print` rules
 * loaded so chrome is hidden and collapsibles are expanded.
 */
export async function saveFinancePdf(opts: { defaultName: string; title?: string }): Promise<SavePdfResult> {
  const bridge = getBridge();
  if (!bridge) {
    window.print();
    return { saved: false, error: 'no-bridge-fallback-to-print' };
  }
  return bridge.saveFinancePdf(opts);
}

export function printCurrentView() {
  window.print();
}

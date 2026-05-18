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
 * Force-open every <details data-print-expand> in the document. Electron's
 * webContents.printToPDF captures the DOM as-is and does NOT fire the
 * `beforeprint` event, so the CSS-only "open in print" hack doesn't work —
 * the browser's UA stylesheet keeps closed-<details> children at
 * `display: none` regardless of any @media print rule we write. The only
 * reliable way is to set the `open` attribute on the elements before the
 * capture happens. Returns a teardown that restores the original state so
 * the on-screen view stays as the user left it.
 */
function expandPrintDetails(): () => void {
  const nodes = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-print-expand]'));
  const wasOpen = nodes.map((d) => d.open);
  for (const d of nodes) d.open = true;
  return () => {
    nodes.forEach((d, i) => {
      d.open = wasOpen[i] ?? false;
    });
  };
}

/**
 * Save the current view as a PDF using Electron's printToPDF when available
 * (admin desktop app), or fall back to the browser's native print dialog
 * (which lets the user pick "Save as PDF" themselves).
 *
 * Expands every <details data-print-expand> before triggering the capture
 * so the orders/waiter/meal/incidents tables actually appear in the PDF
 * (they're collapsed on screen for tidiness). Restores the original
 * open/closed state afterwards.
 */
export async function saveFinancePdf(opts: { defaultName: string; title?: string }): Promise<SavePdfResult> {
  const restore = expandPrintDetails();
  // Give the browser two paint frames to fully lay out the newly-visible
  // content before the main process captures it. Single-rAF can fire
  // before layout has settled in some Chromium builds.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  try {
    const bridge = getBridge();
    if (!bridge) {
      window.print();
      return { saved: false, error: 'no-bridge-fallback-to-print' };
    }
    return await bridge.saveFinancePdf(opts);
  } finally {
    restore();
  }
}

export function printCurrentView() {
  // `window.print()` fires `beforeprint` so the CSS rule already opens
  // <details> via the browser's own pipeline — but we set the attribute
  // ourselves anyway so the rendered preview is consistent with the PDF
  // capture path above.
  const restore = expandPrintDetails();
  try {
    window.print();
  } finally {
    restore();
  }
}

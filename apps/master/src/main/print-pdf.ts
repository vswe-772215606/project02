import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Save the focused page's current content as a PDF.
 *
 * IPC exception to the "no business IPC" rule from decisions.md: this is a
 * Renderer→OS file-system capability (filesystem access + native save dialog),
 * not a business call against the API server. The page renders normally — main
 * just captures it as PDF.
 *
 * The renderer should apply `@media print` rules (hide sidebar/header/buttons,
 * expand collapsibles) before invoking, so the printed view matches what the
 * user expects to land in the PDF.
 */
export async function saveFinancePdf(options: {
  window: BrowserWindow;
  defaultName: string;
  title?: string;
}): Promise<{ saved: boolean; filePath?: string; canceled?: boolean; error?: string }> {
  const { window: win, defaultName } = options;

  if (win.isDestroyed()) {
    return { saved: false, error: 'window-destroyed' };
  }

  const initialPath = join(homedir(), 'Documents', defaultName);

  const result = await dialog.showSaveDialog(win, {
    title: options.title ?? 'PDF saqlash',
    defaultPath: initialPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (result.canceled || !result.filePath) {
    return { saved: false, canceled: true };
  }

  try {
    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
    await writeFile(result.filePath, buffer);
    return { saved: true, filePath: result.filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { saved: false, error: message };
  }
}

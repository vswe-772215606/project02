import { contextBridge, ipcRenderer } from 'electron';

// Master ↔ Master-UI talks over HTTP (see decisions.md). The preload surface is
// reserved for renderer→OS capabilities that have no HTTP equivalent — currently
// just "save the current view as a PDF to disk" via Electron's printToPDF +
// native save dialog. Do NOT add business-data accessors here.

export type SavePdfResult = {
  saved: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
};

contextBridge.exposeInMainWorld('chayxana', {
  saveFinancePdf: (payload: { defaultName: string; title?: string }): Promise<SavePdfResult> =>
    ipcRenderer.invoke('finance:save-pdf', payload),
  saveDailyReportPdf: (payload: { date: string; defaultName?: string; title?: string }): Promise<SavePdfResult> =>
    ipcRenderer.invoke('reports:save-daily-pdf', payload),
});

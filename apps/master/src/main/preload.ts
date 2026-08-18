import { contextBridge, ipcRenderer } from 'electron';

import {
  UPDATER_CHANNELS,
  type UpdaterInstallResult,
  type UpdaterState,
} from './updater/updater-contract';

// Master ↔ Master-UI talks over HTTP (see decisions.md). The preload surface is
// reserved for renderer→OS capabilities that have no HTTP equivalent — saving
// the current view as a PDF via Electron's printToPDF + native save dialog, and
// driving the auto-updater. Do NOT add business-data accessors here.
//
// The updater is an OS capability in the same sense as saveFinancePdf: it
// installs a program, it cannot be done over HTTP, and it is not chayxana data.
// The open-order count the prompt mentions never crosses this bridge — the main
// process reads it and ships a composed Uzbek sentence.

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
  updater: {
    getState: (): Promise<UpdaterState> => ipcRenderer.invoke(UPDATER_CHANNELS.getState),
    checkNow: (): Promise<UpdaterState> => ipcRenderer.invoke(UPDATER_CHANNELS.checkNow),
    installNow: (): Promise<UpdaterInstallResult> => ipcRenderer.invoke(UPDATER_CHANNELS.installNow),
    /**
     * Subscribe to pushed state. Returns an unsubscribe. The IpcRendererEvent
     * is stripped deliberately — nothing from the event object may reach the
     * renderer's React tree.
     */
    onState: (listener: (state: UpdaterState) => void): (() => void) => {
      const handler = (_event: unknown, state: UpdaterState) => listener(state);
      ipcRenderer.on(UPDATER_CHANNELS.state, handler);
      return () => ipcRenderer.removeListener(UPDATER_CHANNELS.state, handler);
    },
  },
});

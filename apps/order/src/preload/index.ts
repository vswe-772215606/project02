import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('serverConfig', {
  getMasterUrl: () => ipcRenderer.invoke('config:get-master-url') as Promise<string | null>,
  setMasterUrl: (url: string) => ipcRenderer.invoke('config:set-master-url', url) as Promise<true>,
  clearMasterUrl: () => ipcRenderer.invoke('config:clear-master-url') as Promise<true>,
});

contextBridge.exposeInMainWorld('discovery', {
  getMasterUrl: () => ipcRenderer.invoke('discovery:get-master-url') as Promise<string | null>,
  waitForMasterUrl: (timeoutMs?: number) =>
    ipcRenderer.invoke('discovery:wait-for-master-url', timeoutMs ?? 5000) as Promise<string | null>,
});

declare global {
  interface Window {
    serverConfig: {
      getMasterUrl: () => Promise<string | null>;
      setMasterUrl: (url: string) => Promise<true>;
      clearMasterUrl: () => Promise<true>;
    };
    discovery: {
      getMasterUrl: () => Promise<string | null>;
      waitForMasterUrl: (timeoutMs?: number) => Promise<string | null>;
    };
  }
}

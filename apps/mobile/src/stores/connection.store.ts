import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'auth-failed' | 'unreachable';

interface ConnectionState {
  status: ConnectionStatus;
  lastSuccessfulContact: string | null;
  setStatus: (status: ConnectionStatus) => void;
  markOnline: () => void;
  markSuccessfulContact: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  lastSuccessfulContact: null,
  setStatus: (status) => set({ status }),
  markOnline: () => set({ status: 'online', lastSuccessfulContact: new Date().toISOString() }),
  markSuccessfulContact: () => set({ lastSuccessfulContact: new Date().toISOString() }),
}));

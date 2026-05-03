import { create } from 'zustand';

interface ConnectionState {
  status: 'online' | 'offline';
  setStatus: (status: 'online' | 'offline') => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'offline',
  setStatus: (status) => set({ status }),
}));

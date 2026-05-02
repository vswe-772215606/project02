import { create } from 'zustand';

type ConnState = 'connecting' | 'online' | 'offline';

export const useConnectionStore = create<{
  status: ConnState;
  setStatus: (s: ConnState) => void;
}>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));

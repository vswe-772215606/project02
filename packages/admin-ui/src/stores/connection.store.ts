import { create } from 'zustand';

export type ConnState = 'connecting' | 'online' | 'reconnecting' | 'auth-failed';

export const useConnectionStore = create<{
  status: ConnState;
  setStatus: (s: ConnState) => void;
}>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));

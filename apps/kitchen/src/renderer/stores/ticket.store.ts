import { create } from 'zustand';

interface TicketState {
  dismissedIds: Set<string>;
  dismiss: (id: string) => void;
}

export const useTicketStore = create<TicketState>((set) => ({
  dismissedIds: new Set(),
  dismiss: (id) => set((state) => ({ 
    dismissedIds: new Set([...state.dismissedIds, id]) 
  })),
}));

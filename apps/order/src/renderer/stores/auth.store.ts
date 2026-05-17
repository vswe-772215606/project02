import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { disconnectSocketClient } from '../lib/socket-client';

type User = { id: string; role: string; fullName: string };

type State = {
  token: string | null;
  user: User | null;
  logoutMessage: string | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  forceLogout: (message?: string) => void;
  clearLogoutMessage: () => void;
};

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      logoutMessage: null,
      setAuth: (token, user) => set({ token, user, logoutMessage: null }),
      clearAuth: () => {
        disconnectSocketClient();
        set({ token: null, user: null, logoutMessage: null });
      },
      forceLogout: (message = "Sessiya tugadi. Iltimos qaytadan kiring.") => {
        disconnectSocketClient();
        if (typeof window !== 'undefined') {
          window.location.hash = '#/';
        }
        set({ token: null, user: null, logoutMessage: message });
      },
      clearLogoutMessage: () => set({ logoutMessage: null }),
    }),
    {
      name: 'chayxana-order-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);

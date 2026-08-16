import { create } from 'zustand';
import { setAuthToken } from '../api/auth-token';
import { disconnectSocketClient } from '../lib/socket-client';

type User = { id: string; role: string; fullName: string };

type State = {
  user: User | null;
  token: string | null;
  logoutMessage: string | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  forceLogout: (message?: string) => void;
  clearLogoutMessage: () => void;
};

export const useAuthStore = create<State>((set) => ({
  user: null,
  token: null,
  logoutMessage: null,
  setAuth: (token, user) => {
    setAuthToken(token);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user, logoutMessage: null });
  },
  clearAuth: () => {
    disconnectSocketClient();
    setAuthToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null, logoutMessage: null });
  },
  forceLogout: (message = "Sessiya tugadi. Iltimos qaytadan kiring.") => {
    disconnectSocketClient();
    setAuthToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    if (typeof window !== 'undefined') {
      window.location.hash = '#/';
    }
    set({ token: null, user: null, logoutMessage: message });
  },
  clearLogoutMessage: () => set({ logoutMessage: null }),
}));

// On boot, hydrate from localStorage
const savedToken = localStorage.getItem('auth_token');
const savedUser = localStorage.getItem('auth_user');
if (savedToken && savedUser) {
  try {
    setAuthToken(savedToken);
    useAuthStore.setState({
      token: savedToken,
      user: JSON.parse(savedUser),
    });
  } catch {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }
}

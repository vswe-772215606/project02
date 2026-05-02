import { create } from 'zustand';
import { setAuthToken } from '../api/client';

type User = { id: string; role: string; fullName: string };

type State = {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<State>((set) => ({
  user: null,
  token: null,
  setAuth: (token, user) => {
    setAuthToken(token);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    setAuthToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null });
  },
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

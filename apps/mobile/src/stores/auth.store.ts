import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { setAuthToken } from '../api/client';

type User = { id: string; role: string; fullName: string };

type State = {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: () => Promise<void>;
};

export const useAuthStore = create<State>((set) => ({
  user: null,
  token: null,
  hydrated: false,

  hydrate: async () => {
    const [t, u] = await Promise.all([
      AsyncStorage.getItem('auth_token'),
      AsyncStorage.getItem('auth_user'),
    ]);
    if (t && u) {
      setAuthToken(t);
      set({ token: t, user: JSON.parse(u), hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },

  setAuth: async (token, user) => {
    setAuthToken(token);
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user });
  },

  clearAuth: async () => {
    setAuthToken(null);
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    set({ token: null, user: null });
  },
}));

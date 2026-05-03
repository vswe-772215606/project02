import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: '',
      setServerUrl: (serverUrl) => set({ serverUrl }),
    }),
    { name: 'chayxana-kitchen-settings' },
  ),
);

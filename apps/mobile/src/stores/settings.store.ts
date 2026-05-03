import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type VibrateMode = 'off' | 'short' | 'double' | 'long';

export const VIBRATE_PATTERNS: Record<VibrateMode, number[]> = {
  off:    [],
  short:  [0, 300],
  double: [0, 300, 150, 300],
  long:   [0, 700],
};

interface SettingsState {
  vibrateMode: VibrateMode;
  setVibrateMode: (m: VibrateMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      vibrateMode: 'double',
      setVibrateMode: (vibrateMode) => set({ vibrateMode }),
    }),
    {
      name: 'chayxana-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ vibrateMode: s.vibrateMode }),
    },
  ),
);

import Constants from 'expo-constants';

export const MASTER_URL =
  (Constants.expoConfig?.extra?.MASTER_URL as string | undefined) ||
  'http://localhost:4000';

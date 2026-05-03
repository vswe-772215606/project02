import Constants from 'expo-constants';

export const MASTER_URL =
  (Constants.expoConfig?.extra?.MASTER_URL as string | undefined) ||
  'http://192.168.1.50:4000';

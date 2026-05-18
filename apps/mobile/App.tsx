import React, { useEffect, useCallback } from 'react';
import { Alert, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from './src/stores/auth.store';
import { setUnauthorizedHandler } from './src/api/client';
import { useSocket } from './src/hooks/useSocket';
import { setupNotifications } from './src/lib/notifications';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ToastContainer } from './src/components/Toast';
import { discoverMasterUrl } from './src/lib/env';
import { useSettingsStore } from './src/stores/settings.store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Inner() {
  useSocket();
  return (
    <View style={{ flex: 1 }}>
      <AppNavigator />
      <ToastContainer />
    </View>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleUnauthorized = useCallback(() => {
    void clearAuth();
    Alert.alert('Sessiya tugadi', 'Qaytadan kiring');
  }, [clearAuth]);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
  }, [handleUnauthorized]);

  useEffect(() => {
    void (async () => {
      await setupNotifications();
      await hydrate();
      await SplashScreen.hideAsync();

      // If the user hasn't pinned a server URL in Settings, scan the LAN
      // for an mDNS-advertised master. Pure HTTP subnet probe, ~5s upper
      // bound. The result is cached for subsequent api calls.
      const stored = useSettingsStore.getState().serverUrl;
      if (!stored) {
        void discoverMasterUrl();
      }
    })();
  }, [hydrate]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Inner />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

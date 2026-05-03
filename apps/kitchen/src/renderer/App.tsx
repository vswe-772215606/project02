import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import { useSettingsStore } from './stores/settings.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { KitchenDisplayPage } from './pages/KitchenDisplayPage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ServerSetupPage } from './pages/ServerSetupPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedApp() {
  useSocket();
  return (
    <>
      <ConnectionBanner />
      <KitchenDisplayPage />
    </>
  );
}

export function App() {
  const user = useAuthStore((s) => s.user);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  return (
    <QueryClientProvider client={queryClient}>
      {!serverUrl ? (
        <ServerSetupPage />
      ) : user ? (
        <AuthedApp />
      ) : (
        <LoginPage />
      )}
    </QueryClientProvider>
  );
}

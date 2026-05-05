import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(!!serverUrl);

  useEffect(() => {
    if (!serverUrl) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    fetch(`${serverUrl}/api/health`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error('bad status'); })
      .catch(() => {
        // Stored URL is unreachable — clear it so ServerSetupPage shows
        setServerUrl('');
        logout();
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setChecking(false);
      });

    return () => { controller.abort(); window.clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 font-bold uppercase tracking-widest text-sm animate-pulse">
          Ulanilmoqda...
        </div>
      </div>
    );
  }

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

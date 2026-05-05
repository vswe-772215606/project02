import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/auth.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { KitchenDisplayPage } from './pages/KitchenDisplayPage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ServerSetupPage } from './pages/ServerSetupPage';
import { MasterUrlProvider, useMasterUrl } from './providers/MasterUrlProvider';
import { checkServerHealth } from './lib/network';

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

function BootScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 font-bold uppercase tracking-widest text-sm animate-pulse">
        {label}
      </div>
    </div>
  );
}

function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { loading, masterUrl, clearMasterUrl } = useMasterUrl();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading || !masterUrl) {
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);

    void checkServerHealth(masterUrl)
      .catch(async () => {
        await clearMasterUrl();
        logout();
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [clearMasterUrl, loading, logout, masterUrl]);

  if (loading) {
    return <BootScreen label="Sozlamalar yuklanmoqda..." />;
  }

  if (checking) {
    return <BootScreen label="Ulanilmoqda..." />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {!masterUrl ? (
        <ServerSetupPage />
      ) : user ? (
        <AuthedApp />
      ) : (
        <LoginPage />
      )}
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <MasterUrlProvider>
      <AppShell />
    </MasterUrlProvider>
  );
}

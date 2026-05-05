import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/auth.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { KitchenDisplayPage } from './pages/KitchenDisplayPage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ConnectionDiagnostics } from './components/ConnectionDiagnostics';
import { ServerSetupPage } from './pages/ServerSetupPage';
import { SettingsPage } from './pages/SettingsPage';
import { MasterUrlProvider, useMasterUrl } from './providers/MasterUrlProvider';
import { checkServerHealth } from './lib/network';
import { useConnectionStore } from './stores/connection.store';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedApp({ onOpenSettings }: { onOpenSettings: () => void }) {
  useSocket();
  return (
    <>
      <KitchenDisplayPage onOpenSettings={onOpenSettings} />
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
  const setStatus = useConnectionStore((s) => s.setStatus);
  const markSuccessfulContact = useConnectionStore((s) => s.markSuccessfulContact);
  const [checking, setChecking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (loading || !masterUrl) {
      setChecking(false);
      setSettingsOpen(false);
      return;
    }

    let active = true;
    setChecking(true);

    void checkServerHealth(masterUrl)
      .then(() => {
        markSuccessfulContact();
        if (!user) {
          setStatus('online');
        }
      })
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
  }, [clearMasterUrl, loading, logout, markSuccessfulContact, masterUrl, setStatus, user]);

  if (loading) {
    return <BootScreen label="Sozlamalar yuklanmoqda..." />;
  }

  if (checking) {
    return <BootScreen label="Ulanilmoqda..." />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {masterUrl ? <ConnectionBanner onOpenSettings={() => setSettingsOpen(true)} /> : null}
      {!masterUrl ? (
        <ServerSetupPage />
      ) : settingsOpen ? (
        <SettingsPage onClose={() => setSettingsOpen(false)} />
      ) : user ? (
        <AuthedApp onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <LoginPage onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <ConnectionDiagnostics />
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

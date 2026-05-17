import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MasterUrlProvider, useMasterUrl } from './providers/MasterUrlProvider';
import { useAuthStore } from './stores/auth.store';
import { useConnectionStore } from './stores/connection.store';
import { useSocket } from './hooks/useSocket';
import { checkServerHealth } from './lib/network';
import { AppShell } from './components/layout/AppShell';
import { ConnectionDiagnostics } from './components/ConnectionDiagnostics';
import { ToastViewport } from './components/ToastViewport';
import { LoginPage } from './pages/LoginPage';
import { ServerSetupPage } from './pages/ServerSetupPage';
import { HomePage } from './pages/HomePage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { TablesPage } from './pages/TablesPage';
import { MenuPage } from './pages/MenuPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function BootScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground font-semibold uppercase tracking-widest text-xs animate-pulse">
        {label}
      </div>
    </div>
  );
}

function AuthedApp() {
  useSocket();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/orders/new" element={<NewOrderPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RequireSetup({ children }: { children: React.ReactNode }) {
  const { masterUrl, loading } = useMasterUrl();
  const location = useLocation();

  if (loading) return <BootScreen label="Sozlamalar yuklanmoqda..." />;

  if (!masterUrl && location.pathname !== '/server-setup') {
    return <Navigate to="/server-setup" replace />;
  }

  if (masterUrl && location.pathname === '/server-setup') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function HealthCheckGate({ children }: { children: React.ReactNode }) {
  const { masterUrl, clearMasterUrl } = useMasterUrl();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const markSuccessfulContact = useConnectionStore((s) => s.markSuccessfulContact);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!masterUrl) {
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);
    void checkServerHealth(masterUrl)
      .then(() => {
        if (!active) return;
        markSuccessfulContact();
        setStatus('online');
      })
      .catch(async () => {
        if (!active) return;
        await clearMasterUrl();
        clearAuth();
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [masterUrl, clearAuth, clearMasterUrl, markSuccessfulContact, setStatus]);

  if (checking) {
    return <BootScreen label="Ulanilmoqda..." />;
  }

  return <>{children}</>;
}

function Routed() {
  const token = useAuthStore((s) => s.token);
  const { masterUrl } = useMasterUrl();
  const location = useLocation();
  const navigate = useNavigate();

  // If unauthenticated and not on login/server-setup, redirect.
  useEffect(() => {
    if (!masterUrl) return;
    if (!token && location.pathname !== '/login' && location.pathname !== '/server-setup') {
      navigate('/login', { replace: true });
    }
  }, [token, masterUrl, location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/server-setup" element={<ServerSetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={token ? <AuthedApp /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MasterUrlProvider>
        <HashRouter>
          <RequireSetup>
            <HealthCheckGate>
              <Routed />
            </HealthCheckGate>
          </RequireSetup>
          <ToastViewport />
          <ConnectionDiagnostics />
        </HashRouter>
      </MasterUrlProvider>
    </QueryClientProvider>
  );
}

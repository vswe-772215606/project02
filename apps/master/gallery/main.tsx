import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@/styles.css';
import { installMockServer } from './mock-server';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { AppShell } from '@/components/layout/AppShell';
import { ComponentsPage } from '@/pages/ComponentsPage';
import { ApprovalQueuePage } from '@/pages/ApprovalQueuePage';
import { OmborPage } from '@/pages/OmborPage';
import { Toaster } from '@/components/ui/sonner';

/**
 * Browser preview of the master renderer.
 *
 * The master only runs inside Electron on Windows, so this mounts the real
 * screens — real components, real queries, real mutations — against a stubbed
 * API, inside a frame the exact size of the till (1366×768). What you see here
 * is what the app renders, at the proportions it renders them.
 */

installMockServer();
useAuthStore.setState({ token: 'preview', user: { id: 'u1', role: 'ADMIN', fullName: 'Dilshod' } });
useConnectionStore.setState({ status: 'online' });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/**
 * App screens carry their real Uzbek names because that is what the operator
 * sees. The last entry is a developer reference — the component sheet — and is
 * labelled in English and set apart, so it never reads as a screen of the app.
 */
const VIEWS = [
  { id: 'tasdiqlash', label: 'Tasdiqlash', path: '/approval-queue', app: true },
  { id: 'ombor', label: 'Ombor', path: '/ombor', app: true },
  { id: 'design', label: 'Design system', path: '/components', app: false },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

/** Scales the 1366×768 frame down to whatever width the browser gives us. */
function Frame({ children }: { children: React.ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const width = holder.current?.clientWidth ?? 1366;
      setScale(Math.min(1, width / 1366));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div ref={holder} style={{ width: '100%', height: 768 * scale, overflow: 'hidden' }}>
      <div
        style={{
          width: 1366,
          height: 768,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          boxShadow: '0 0 0 1px rgba(0,0,0,.12)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Preview() {
  const [view, setView] = useState<ViewId>('tasdiqlash');
  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  return (
    <div style={{ minHeight: '100%', background: '#DAD5CC', padding: 12 }}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            style={!v.app ? { marginLeft: 16 } : undefined}
            className={
              v.id === view
                ? 'h-control bg-selected px-5 text-[15px] font-semibold text-selected-foreground'
                : v.app
                  ? 'h-control bg-field px-5 text-[15px] font-semibold text-foreground'
                  : 'h-control bg-field-raised px-5 text-[15px] font-semibold text-muted-foreground'
            }
          >
            {v.label}
          </button>
        ))}
        <span className="ml-3 text-[13px] text-muted-foreground">
          {active.app
            ? "1366 × 768 · haqiqiy sahifa, soxta ma'lumot"
            : '1366 × 768 · developer reference, not an app screen'}
        </span>
      </div>

      <Frame>
        {/* Remounted per view so each screen starts from a clean state. */}
        <MemoryRouter key={active.id} initialEntries={[active.path]}>
          <AppShell>
            <Routes>
              <Route path="/approval-queue" element={<ApprovalQueuePage />} />
              <Route path="/ombor" element={<OmborPage />} />
              <Route path="/components" element={<ComponentsPage />} />
            </Routes>
          </AppShell>
        </MemoryRouter>
      </Frame>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Gallery mount point #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Preview />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);

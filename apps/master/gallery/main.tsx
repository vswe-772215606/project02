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
import { DashboardPage } from '@/pages/DashboardPage';
import { ApprovalQueuePage } from '@/pages/ApprovalQueuePage';
import { OrdersPage } from '@/pages/OrdersPage';
import { MenuPage } from '@/pages/MenuPage';
import { TablesPage } from '@/pages/TablesPage';
import { OmborPage } from '@/pages/OmborPage';
import { FinancePage } from '@/pages/FinancePage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { DebtsPage } from '@/pages/DebtsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SalariesPage } from '@/pages/SalariesPage';
import { UsersPage } from '@/pages/UsersPage';
import { DiscountsPage } from '@/pages/DiscountsPage';
import { AuditPage } from '@/pages/AuditPage';
import { SettingsPage } from '@/pages/SettingsPage';
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
// OWNER rather than ADMIN: Hisobot (/reports) is OWNER-only server-side and
// would otherwise render its "Ruxsat yo'q" state instead of a real screen.
// OWNER is a strict superset of ADMIN everywhere else in this app, so every
// other screen renders unchanged — this id/name matches the OWNER row seeded
// in fixtures/users.ts, so "Dilshod Yusupov" selecting himself in
// Foydalanuvchilar behaves correctly (can't deactivate your own session).
useAuthStore.setState({ token: 'preview', user: { id: 'u-owner', role: 'OWNER', fullName: 'Dilshod Yusupov' } });
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
  { id: 'bugun', label: 'Bugun', path: '/', app: true },
  { id: 'tasdiqlash', label: 'Tasdiqlash', path: '/approval-queue', app: true },
  { id: 'buyurtmalar', label: 'Buyurtmalar', path: '/orders', app: true },
  { id: 'menyu', label: 'Menyu', path: '/menu', app: true },
  { id: 'stollar', label: 'Stollar', path: '/tables', app: true },
  { id: 'ombor', label: 'Ombor', path: '/ombor', app: true },
  { id: 'moliya', label: 'Kunlik moliya', path: '/finance', app: true },
  { id: 'chiqimlar', label: 'Chiqimlar', path: '/expenses', app: true },
  { id: 'qarzlar', label: 'Qarzlar', path: '/debts', app: true },
  { id: 'hisobot', label: 'Hisobot', path: '/reports', app: true },
  { id: 'maosh', label: 'Xodimlar maoshi', path: '/salaries', app: true },
  { id: 'foydalanuvchilar', label: 'Foydalanuvchilar', path: '/users', app: true },
  { id: 'chegirmalar', label: 'Chegirmalar', path: '/discounts', app: true },
  { id: 'audit', label: 'Amallar tarixi', path: '/audit', app: true },
  { id: 'sozlamalar', label: 'Sozlamalar', path: '/settings', app: true },
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
  const [view, setView] = useState<ViewId>('bugun');
  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  return (
    <div style={{ minHeight: '100%', background: '#DAD5CC', padding: 12 }}>
      <div style={{ display: 'flex', gap: '8px 4px', marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
              <Route path="/" element={<DashboardPage />} />
              <Route path="/approval-queue" element={<ApprovalQueuePage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/tables" element={<TablesPage />} />
              <Route path="/ombor" element={<OmborPage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/debts" element={<DebtsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/salaries" element={<SalariesPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/discounts" element={<DiscountsPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
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

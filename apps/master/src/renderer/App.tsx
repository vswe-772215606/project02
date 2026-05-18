import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { OrdersPage } from './pages/OrdersPage';
import { MenuPage } from './pages/MenuPage';
import { TablesPage } from './pages/TablesPage';
import { UsersPage } from './pages/UsersPage';
import { DiscountsPage } from './pages/DiscountsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DebtsPage } from './pages/DebtsPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { RecipesPage } from './pages/RecipesPage';
import { FinancePage } from './pages/FinancePage';
import { SalariesPage } from './pages/SalariesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedRoutes() {
  useSocket();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/approval-queue" element={<ApprovalQueuePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
        <Route path="/ingredients" element={<IngredientsPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/salaries" element={<SalariesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  const user = useAuthStore((s) => s.user);
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        {user ? <AuthedRoutes /> : <LoginPage />}
      </HashRouter>
    </QueryClientProvider>
  );
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ordersApi } from '@/api/orders';
import { stockApi } from '@/api/stock';
import { financeApi } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/stores/auth.store';
import { Screen } from '@/components/layout/Screen';
import { Seam } from '@/components/blocks';
import { tashkentDayKey } from '@/lib/format';
import { PendingOrdersCard } from '@/components/dashboard/PendingOrdersCard';
import { UncountedDishesCard } from '@/components/dashboard/UncountedDishesCard';
import { RecentOrdersList } from '@/components/dashboard/RecentOrdersList';
import { MoneyPanel } from '@/components/dashboard/MoneyPanel';

/**
 * Bugun — the landing screen.
 *
 * A work queue, not a dashboard: what needs the admin right now (orders
 * awaiting confirm, dishes with no count), then what just happened. Sof
 * foyda never appears here — see MoneyPanel.
 */
export function DashboardPage() {
  usePageTitle('Bugun');

  // NavRail allows WAITER on this route too, but /api/stock and
  // /api/finance/daily are ADMIN+OWNER-only on the server (403 for WAITER).
  // Gate the two queries this rewrite adds so a waiter's session doesn't
  // poll a route it can't read; the cards degrade to empty, same as loading.
  const role = useAuthStore((s) => s.user?.role);
  const canSeeMoney = role === 'ADMIN' || role === 'OWNER';

  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  // Same endpoint Ombor already calls, same query key — the two screens
  // share one cache instead of double-fetching the stock list.
  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock'],
    queryFn: stockApi.list,
    enabled: canSeeMoney,
    refetchInterval: canSeeMoney ? 30000 : false,
  });

  // DashboardPage previously fetched nothing but orders. Savdo / Kassada /
  // Nasiya qoldiq / Chiqim need the daily ledger, so this adds the same
  // financeApi.daily query FinancePage already runs (existing endpoint,
  // same query key — no new backend surface).
  const today = tashkentDayKey();
  const { data: finance } = useQuery({
    queryKey: ['finance', 'daily', today],
    queryFn: () => financeApi.daily(today),
    enabled: canSeeMoney,
    refetchInterval: canSeeMoney ? 30000 : false,
  });

  const pendingOrders = useMemo(
    () => allOrders.filter((order) => order.status === 'SENT'),
    [allOrders],
  );

  const uncountedItems = useMemo(
    () => stockItems.filter((item) => item.stockCount === null),
    [stockItems],
  );

  const recentOrders = useMemo(
    () =>
      [...allOrders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    [allOrders],
  );

  return (
    <Screen title="Bugun" panel={<MoneyPanel finance={finance} />}>
      <Seam className="content-start">
        <PendingOrdersCard orders={pendingOrders} />
        <UncountedDishesCard items={uncountedItems} />
        <RecentOrdersList orders={recentOrders} />
      </Seam>
    </Screen>
  );
}

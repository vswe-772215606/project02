import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { ordersApi, type Order } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { tashkentDayKey } from '@/lib/format';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { OrderList } from '@/components/orders/OrderList';
import { OrderPanel } from '@/components/orders/OrderPanel';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';

type HistoryStatus = 'SENT' | 'CLOSED' | 'CANCELED';

const FILTER_TABS: HistoryStatus[] = ['SENT', 'CLOSED', 'CANCELED'];

const TAB_LABELS: Record<HistoryStatus, string> = {
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  CANCELED: 'Bekor qilingan',
};

/**
 * Buyurtmalar — order history and detail.
 *
 * The list scopes to one status tab; the panel holds whichever order is
 * selected, its lines, and the one action its status allows. Cancelling
 * asks for a reason in a dialog.
 *
 * SENT is live state and stays unscoped — it is small by definition. CLOSED
 * and CANCELED are scoped to the Tashkent day, because they only grow.
 */
export function OrdersPage() {
  usePageTitle('Buyurtmalar');

  const [activeTab, setActiveTab] = useState<HistoryStatus>('SENT');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  // Tashkent day, matching the server's own bucketing. This page used to roll
  // its own `localDateString()` off the browser's timezone while the rest of
  // the app used `tashkentDayKey()` — a divergence that only shows up on a
  // host outside Tashkent, and then silently asks for the wrong day.
  const today = tashkentDayKey();

  const dayScoped = (status: HistoryStatus) => (status === 'SENT' ? undefined : today);

  // One query per tab, so a tab's count is the number of rows that tab shows.
  // The count used to come from a separate unfiltered call, which the server
  // answers with active orders only — CLOSED and CANCELED were never in it, so
  // both tabs read "0" above the rows they were listing.
  const tabQueries = useQueries({
    queries: FILTER_TABS.map((status) => ({
      queryKey: ['orders', status, dayScoped(status) ?? 'all'] as const,
      queryFn: () => ordersApi.list({ status, date: dayScoped(status) }),
      refetchInterval: 10000,
    })),
  });

  const orders = useMemo(
    () => tabQueries[FILTER_TABS.indexOf(activeTab)]?.data ?? [],
    [tabQueries, activeTab],
  );

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    FILTER_TABS.forEach((status, index) => {
      acc[status] = tabQueries[index]?.data?.length ?? 0;
    });
    return acc;
  }, [tabQueries]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (order) =>
        (order.orderNumber?.toLowerCase().includes(q) ?? false) ||
        (order.tableName?.toLowerCase().includes(q) ?? false),
    );
  }, [orders, search]);

  const selectedSummary = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId],
  );

  // The list payload carries no lines (see ApprovalQueuePage) — the panel
  // needs them, so fetch the selected order in full.
  const { data: fullOrder } = useQuery({
    queryKey: ['orders', selectedId],
    queryFn: () => ordersApi.getById(selectedId as string),
    enabled: selectedId !== null,
  });

  const panelOrder = fullOrder ?? selectedSummary;

  return (
    <>
      <Screen
        title="Buyurtmalar"
        status={
          <>
            {FILTER_TABS.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={activeTab === status ? 'default' : 'secondary'}
                onClick={() => {
                  setActiveTab(status);
                  setSelectedId(null);
                }}
              >
                {TAB_LABELS[status]} {counts[status] ?? 0}
              </Button>
            ))}
          </>
        }
        panel={
          panelOrder ? (
            <OrderPanel key={panelOrder.id} order={panelOrder} onCancel={setCancelTarget} />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              Buyurtmani tanlang
            </div>
          )
        }
      >
        <OrderList
          orders={filteredOrders}
          search={search}
          onSearchChange={setSearch}
          selectedId={selectedId}
          onSelect={(order) => setSelectedId(order.id)}
        />
      </Screen>

      <CancelOrderDialog
        order={cancelTarget}
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
      />
    </>
  );
}

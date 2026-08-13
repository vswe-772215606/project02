import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ordersApi, type Order } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { OrderList } from '@/components/orders/OrderList';
import { OrderPanel } from '@/components/orders/OrderPanel';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';

type HistoryStatus = 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';

const FILTER_TABS: HistoryStatus[] = ['SENT', 'CLOSED', 'WALKOUT', 'CANCELED'];

const TAB_LABELS: Record<HistoryStatus, string> = {
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lamay ketdi",
  CANCELED: 'Bekor qilingan',
};

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Buyurtmalar — order history and detail.
 *
 * The list scopes to one status tab; the panel holds whichever order is
 * selected, its lines, and the one action its status allows. Cancelling
 * asks for a reason in a dialog — mirrors Tasdiqlash's walkout flow.
 */
export function OrdersPage() {
  usePageTitle('Buyurtmalar');

  const [activeTab, setActiveTab] = useState<HistoryStatus>('SENT');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', activeTab],
    queryFn: () =>
      ordersApi.list({
        status: activeTab,
        date: activeTab === 'CLOSED' ? localDateString() : undefined,
      }),
  });

  // Unfiltered, polled — only used to keep the tab counts live.
  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders', 'active_counts'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const order of allOrders) acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, [allOrders]);

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

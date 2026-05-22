import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { History, Plus, Search } from 'lucide-react';
import { Order, ordersApi } from '@/api/orders';
import { OrderStatus, StatusBadge } from '@/components/StatusBadge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const FILTER_TABS: { status: OrderStatus }[] = [
  { status: 'DRAFT' },
  { status: 'SENT' },
  { status: 'CLOSED' },
  { status: 'WALKOUT' },
  { status: 'CANCELED' },
];

const TAB_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
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

function locationLabel(order: Order): string {
  return (
    order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')
  );
}

function shortOrderNumber(orderNumber: string | null | undefined): string {
  if (!orderNumber) return '—';
  return orderNumber.slice(-6).toUpperCase();
}

export function OrdersPage() {
  usePageTitle('Buyurtmalar');
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<OrderStatus>('SENT');
  const [search, setSearch] = useState('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', activeTab],
    queryFn: () =>
      ordersApi.list({
        status: activeTab,
        date: activeTab === 'CLOSED' ? localDateString() : undefined,
      }),
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['orders', 'active_counts'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    return activeOrders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [activeOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        (o.orderNumber?.toLowerCase().includes(q) ?? false) ||
        (o.tableName?.toLowerCase().includes(q) ?? false),
    );
  }, [orders, search]);

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'orderNumber',
      header: '№',
      width: '110px',
      cell: (row) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {shortOrderNumber(row.orderNumber)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      width: '140px',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'location',
      header: 'Stol / Tur',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium truncate">{locationLabel(row)}</span>
          <span className="text-xs text-muted-foreground truncate">
            {row.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Zalda'}
          </span>
        </div>
      ),
    },
    {
      key: 'waiter',
      header: 'Ofitsiant',
      cell: (row) => (
        <span className="text-sm text-muted-foreground truncate">
          {row.waiter?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.totalSnapshot ?? row.totalAmount} />,
    },
    {
      key: 'when',
      header: 'Vaqti',
      width: '170px',
      cell: (row) => (
        <DateTimeCell
          value={row.status === 'CLOSED' && row.closedAt ? row.closedAt : row.createdAt}
          className="text-muted-foreground"
        />
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Buyurtmalar"
        description="Buyurtmalarni yaratish, boshqarish va tarixini ko'rish"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                type="text"
                placeholder="Buyurtma yoki stol..."
                className="pl-8 h-9 w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => navigate('/orders/new')}>
              <Plus className="h-4 w-4" />
              Yangi buyurtma
            </Button>
          </div>
        }
      />

      {/* Filter tabs */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_TABS.map((tab) => {
              const count = counts[tab.status] ?? 0;
              const isActive = activeTab === tab.status;
              return (
                <Button
                  key={tab.status}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setActiveTab(tab.status)}
                >
                  <span>{TAB_LABELS[tab.status]}</span>
                  {(count > 0 || isActive) && (
                    <span
                      className={cn(
                        'ml-1 px-1.5 rounded-full text-[10px] font-semibold tabular-nums',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filteredOrders}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/orders/${row.id}`)}
        emptyState={
          <EmptyState
            icon={search ? Search : History}
            title={search ? 'Mos buyurtma topilmadi' : 'Hech qanday buyurtma topilmadi'}
            hint={
              search
                ? "Qidiruv shartlarini o'zgartiring yoki tozalang."
                : "Tanlangan holat bo'yicha buyurtmalar yo'q."
            }
          />
        }
      />
    </PageContent>
  );
}

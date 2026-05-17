import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ShoppingBag, type LucideIcon } from 'lucide-react';
import { ordersApi, type Order } from '../api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

const STATUS_LABEL: Record<Order['status'], string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lovsiz ketdi",
  CANCELED: 'Bekor qilingan',
};

const STATUS_VARIANT: Record<Order['status'], string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-info/15 text-info border-info/30',
  CLOSED: 'bg-success/15 text-success border-success/30',
  WALKOUT: 'bg-destructive/15 text-destructive border-destructive/30',
  CANCELED: 'bg-muted text-muted-foreground border-muted',
};

function StatusBadge({ status }: { status: Order['status'] }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_VARIANT[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  isLoading,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {isLoading ? <span className="text-muted-foreground">—</span> : value}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </CardContent>
    </Card>
  );
}

function summariseLines(order: Order): string {
  if (!order.lines || order.lines.length === 0) return '';
  return order.lines
    .filter((line) => !line.isCanceled)
    .slice(0, 3)
    .map((line) => `${line.quantity}× ${line.nameSnapshot}`)
    .join(', ');
}

export function DashboardPage() {
  usePageTitle('Boshqaruv paneli');

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const activeCount = allOrders.filter((o) => o.status === 'SENT').length;
  const draftCount = allOrders.filter((o) => o.status === 'DRAFT').length;

  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'order',
      header: 'Buyurtma',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium tabular-nums">#{row.orderNumber}</span>
          <span className="text-xs text-muted-foreground truncate max-w-xs">{summariseLines(row)}</span>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.createdAt} className="text-muted-foreground" />,
    },
    {
      key: 'table',
      header: 'Stol / Ofitsiant',
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {row.tableName ?? (row.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')}
          </span>
          <span className="text-xs text-muted-foreground">{row.waiter?.fullName ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.totalSnapshot ?? row.totalAmount} />,
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Boshqaruv paneli"
        description={`Bugun: ${formatDate(new Date())}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard
          label="Tasdiqlash kutilmoqda"
          value={activeCount}
          icon={ClipboardCheck}
          hint="Yuborilgan, tasdiqlash kutayotgan buyurtmalar"
          isLoading={isLoading}
        />
        <StatCard
          label="Qoralama buyurtmalar"
          value={draftCount}
          icon={ShoppingBag}
          hint="Ofitsiantlar tahrirlayotgan buyurtmalar"
          isLoading={isLoading}
        />
      </div>

      <DataTable
        columns={columns}
        data={recentOrders}
        isLoading={isLoading}
        rowKey={(row) => row.id}
      />
    </PageContent>
  );
}

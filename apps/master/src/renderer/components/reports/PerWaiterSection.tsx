import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { formatMoney } from '@/lib/format';
import { Section, sumMoney } from './report-helpers';

type WaiterRow = DailyReport['perWaiter'][number];

export function PerWaiterSection({ report }: { report: DailyReport }) {
  const totals = useMemo(
    () => ({
      orders: report.perWaiter.reduce((sum, item) => sum + item.orders, 0),
      revenue: sumMoney(report.perWaiter.map((item) => item.revenue)),
      serviceEarned: sumMoney(report.perWaiter.map((item) => item.serviceEarned)),
    }),
    [report.perWaiter],
  );

  const columns: DataTableColumn<WaiterRow>[] = [
    {
      key: 'waiter',
      header: 'Ofitsiant',
      cell: (row) => <span className="font-medium">{row.waiterName}</span>,
    },
    {
      key: 'orders',
      header: 'Buyurtma soni',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.orders}</span>,
    },
    {
      key: 'revenue',
      header: 'Umumiy savdo',
      align: 'right',
      cell: (row) => <MoneyCell value={row.revenue} />,
    },
    {
      key: 'service',
      header: 'Xizmat haqi',
      align: 'right',
      cell: (row) => <MoneyCell value={row.serviceEarned} className="text-info" />,
    },
  ];

  return (
    <Section
      title="Ofitsiantlar bo'yicha"
      description="Har bir ofitsiantning bugungi buyurtma soni, savdosi va yozilgan xizmat haqi."
    >
      <DataTable
        columns={columns}
        data={report.perWaiter}
        rowKey={(row) => row.waiterId}
        emptyState={<span className="text-sm">Ofitsiantlar bo'yicha ma'lumot yo'q</span>}
      />
      {report.perWaiter.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Jami
          </span>
          <div className="flex items-center gap-6 tabular-nums">
            <span>{totals.orders} ta</span>
            <span className="font-semibold">{formatMoney(totals.revenue)}</span>
            <span className="text-info font-semibold">{formatMoney(totals.serviceEarned)}</span>
          </div>
        </div>
      )}
    </Section>
  );
}

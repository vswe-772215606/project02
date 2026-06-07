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
      orders: report.perWaiter.reduce((s, w) => s + w.orders, 0),
      revenue: sumMoney(report.perWaiter.map((w) => w.revenue)),
      service: sumMoney(report.perWaiter.map((w) => w.serviceEarned)),
    }),
    [report.perWaiter],
  );

  const columns: DataTableColumn<WaiterRow>[] = [
    {
      key: 'name',
      header: 'Ofitsiant',
      cell: (row) => <span className="font-medium">{row.waiterName}</span>,
    },
    {
      key: 'orders',
      header: 'Yopilgan buyurtmalar',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.orders}</span>,
    },
    {
      key: 'revenue',
      header: 'Sotuv',
      align: 'right',
      cell: (row) => <MoneyCell value={row.revenue} />,
    },
    {
      key: 'service',
      header: 'Xizmat haqi',
      align: 'right',
      cell: (row) => (
        <MoneyCell
          value={row.serviceEarned}
          className={Number(row.serviceEarned) > 0 ? 'text-success' : ''}
        />
      ),
    },
    {
      key: 'avg',
      header: "O'rtacha chek",
      align: 'right',
      cell: (row) => {
        const avg = row.orders > 0 ? Math.round(Number(row.revenue) / row.orders) : 0;
        return <span className="tabular-nums text-muted-foreground">{formatMoney(avg)}</span>;
      },
    },
  ];

  return (
    <Section title="Ofitsiantlar bo'yicha">
      <DataTable
        columns={columns}
        data={report.perWaiter}
        rowKey={(row) => row.waiterId}
        emptyState={<span className="text-sm">Bu sana uchun ofitsiantlar daromadi topilmadi</span>}
      />
      {report.perWaiter.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 px-4 py-2 text-sm sm:grid-cols-4">
          <Totaled label="Ofitsiantlar" value={`${report.perWaiter.length} ta`} />
          <Totaled label="Buyurtmalar" value={`${totals.orders} ta`} />
          <Totaled label="Jami sotuv" value={formatMoney(totals.revenue)} bold />
          <Totaled label="Jami xizmat haqi" value={formatMoney(totals.service)} />
        </div>
      )}
    </Section>
  );
}

function Totaled({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

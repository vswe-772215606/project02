import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { FieldLabel, RowMoney } from '@/components/blocks';
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
      cell: (row) => <RowMoney>{formatMoney(row.revenue)}</RowMoney>,
    },
    {
      key: 'service',
      header: 'Xizmat haqi',
      align: 'right',
      cell: (row) => (
        <RowMoney className={Number(row.serviceEarned) > 0 ? 'text-success' : ''}>
          {formatMoney(row.serviceEarned)}
        </RowMoney>
      ),
    },
    {
      key: 'avg',
      header: "O'rtacha chek",
      align: 'right',
      cell: (row) => {
        const avg = row.orders > 0 ? Math.round(Number(row.revenue) / row.orders) : 0;
        return <RowMoney className="text-muted-foreground">{formatMoney(avg)}</RowMoney>;
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
        <div className="mt-3 grid grid-cols-2 gap-2 bg-field-raised px-4 py-2 sm:grid-cols-4">
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
      <FieldLabel>{label}</FieldLabel>
      <span className={`text-[17px] tabular-nums ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

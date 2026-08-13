import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { FieldLabel, RowMoney } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import { Section, sumMoney } from './report-helpers';

type MealRow = DailyReport['mealSales'][number];

export function MealSalesSection({ report }: { report: DailyReport }) {
  const totals = useMemo(
    () => ({
      qty: report.mealSales.reduce((s, m) => s + m.qtyOrdered, 0),
      gross: sumMoney(report.mealSales.map((m) => m.grossSales)),
      ordersCount: report.mealSales.reduce((s, m) => s + m.ordersCount, 0),
    }),
    [report.mealSales],
  );

  const columns: DataTableColumn<MealRow>[] = [
    {
      key: 'name',
      header: 'Taom',
      cell: (row) => <span className="font-medium">{row.mealName}</span>,
    },
    {
      key: 'category',
      header: 'Turkum',
      cell: (row) => <span className="text-muted-foreground">{row.categoryName ?? '—'}</span>,
    },
    {
      key: 'qty',
      header: 'Sotilgan miqdor',
      align: 'right',
      cell: (row) => <span className="tabular-nums font-medium">{row.qtyOrdered}</span>,
    },
    {
      key: 'orders',
      header: 'Buyurtmalarda',
      align: 'right',
      cell: (row) => <span className="tabular-nums text-muted-foreground">{row.ordersCount}</span>,
    },
    {
      key: 'gross',
      header: 'Sotuv',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.grossSales)}</RowMoney>,
    },
    {
      key: 'avg',
      header: "O'rt. 1 buyurtma",
      align: 'right',
      cell: (row) => <RowMoney className="text-muted-foreground">{formatMoney(row.avgPerOrder)}</RowMoney>,
    },
  ];

  return (
    <Section title="Taomlar bo'yicha sotuv">
      <DataTable
        columns={columns}
        data={report.mealSales}
        rowKey={(row) => row.mealName}
        emptyState={<span className="text-sm">Bu sana uchun taom sotuvi topilmadi</span>}
      />
      {report.mealSales.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 bg-field-raised px-4 py-2 sm:grid-cols-4">
          <Totaled label="Taom turlari" value={`${report.mealSales.length} ta`} />
          <Totaled label="Jami sotilgan" value={`${totals.qty} dona`} />
          <Totaled label="Buyurtmalarda" value={`${totals.ordersCount} ta`} />
          <Totaled label="Jami sotuv" value={formatMoney(totals.gross)} bold />
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

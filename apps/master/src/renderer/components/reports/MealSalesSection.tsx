import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { formatMoney } from '@/lib/format';
import { Section, sumMoney } from './report-helpers';

type MealRow = DailyReport['mealSales'][number];

export function MealSalesSection({ report }: { report: DailyReport }) {
  const totals = useMemo(
    () => ({
      qtyOrdered: report.mealSales.reduce((sum, item) => sum + item.qtyOrdered, 0),
      grossSales: sumMoney(report.mealSales.map((item) => item.grossSales)),
    }),
    [report.mealSales],
  );

  const columns: DataTableColumn<MealRow>[] = [
    {
      key: 'meal',
      header: 'Taom',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium">{row.mealName}</span>
          {row.categoryName && (
            <span className="text-xs text-muted-foreground">{row.categoryName}</span>
          )}
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Buyurtmalar',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.ordersCount}</span>,
    },
    {
      key: 'qty',
      header: 'Soni',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.qtyOrdered}</span>,
    },
    {
      key: 'avg',
      header: "O'rtacha",
      align: 'right',
      cell: (row) => <MoneyCell value={row.avgPerOrder} className="text-muted-foreground" />,
    },
    {
      key: 'gross',
      header: 'Jami',
      align: 'right',
      cell: (row) => <MoneyCell value={row.grossSales} />,
    },
  ];

  return (
    <Section
      title="Taomlar bo'yicha savdo"
      description="Qaysi taom necha marta sotilgan va umumiy summa."
    >
      <DataTable
        columns={columns}
        data={report.mealSales}
        rowKey={(row) => `${row.mealName}-${row.categoryName ?? ''}`}
        emptyState={<span className="text-sm">Tanlangan sana uchun taomlar savdosi topilmadi</span>}
      />
      {report.mealSales.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Jami
          </span>
          <div className="flex items-center gap-6 tabular-nums">
            <span>{totals.qtyOrdered} dona</span>
            <span className="font-semibold">{formatMoney(totals.grossSales)}</span>
          </div>
        </div>
      )}
    </Section>
  );
}

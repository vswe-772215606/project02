import type { MonthlyDayRow, MonthlyReport } from '@/api/reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowMoney } from '@/components/blocks';
import { formatMoney } from '@/lib/format';

type Props = {
  report: MonthlyReport;
  onSelectDay: (day: MonthlyDayRow) => void;
};

function dayLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  const day = parts[2] ?? '';
  return Number(day).toString();
}

function weekdayLabel(dateStr: string): string {
  // Parse the YYYY-MM-DD as a UTC midnight instant so getUTCDay() gives the
  // calendar weekday of that date, identical in any TZ. Avoids the
  // server-local getDay() drift.
  const d = new Date(`${dateStr}T00:00:00Z`);
  const names = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
  const dayOfWeek = d.getUTCDay();
  return names[dayOfWeek] ?? '';
}

export function MonthlyTable({ report, onSelectDay }: Props) {
  // Only render rows that actually have activity, plus visually emphasise
  // weekends with a slight muted tint to make the table easy to scan.
  const rows = report.daily;

  const columns: DataTableColumn<MonthlyDayRow>[] = [
    {
      key: 'date',
      header: 'Sana',
      cell: (row) => (
        <div className="font-medium tabular-nums">
          {dayLabel(row.date)}{' '}
          <span className="text-[13px] font-normal text-muted-foreground">
            {weekdayLabel(row.date)}
          </span>
        </div>
      ),
      width: '6rem',
    },
    {
      key: 'orders',
      header: 'Buyurtmalar',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.sales.closedOrders}</span>,
    },
    {
      key: 'gross',
      header: 'Yalpi sotuv',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.sales.grossSales)}</RowMoney>,
    },
    {
      key: 'discount',
      header: 'Chegirma',
      align: 'right',
      cell: (row) => (
        <RowMoney className={Number(row.sales.discounts) > 0 ? 'text-muted-foreground' : ''}>
          {formatMoney(row.sales.discounts)}
        </RowMoney>
      ),
    },
    {
      key: 'net',
      header: 'Sof sotuv',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.sales.netSales)}</RowMoney>,
    },
    {
      key: 'service',
      header: 'Xizmat haqi',
      align: 'right',
      cell: (row) => (
        <RowMoney className={Number(row.sales.serviceCharge) > 0 ? 'text-success' : 'text-muted-foreground'}>
          {formatMoney(row.sales.serviceCharge)}
        </RowMoney>
      ),
    },
    {
      key: 'expenses',
      header: 'Chiqim',
      align: 'right',
      cell: (row) => <RowMoney className="text-warning">{formatMoney(row.expenses.net)}</RowMoney>,
    },
    {
      key: 'profit',
      header: 'Foyda',
      align: 'right',
      cell: (row) => {
        const v = Number(row.results.salesBasedProfit);
        return (
          <RowMoney className={v >= 0 ? 'text-success' : 'text-destructive'}>
            {formatMoney(row.results.salesBasedProfit)}
          </RowMoney>
        );
      },
    },
    {
      key: 'outstanding',
      header: "Qarz qoldig'i",
      align: 'right',
      cell: (row) => {
        const v = Number(row.debtSnapshot.outstandingTotal);
        return (
          <RowMoney className={v > 0 ? 'text-destructive' : 'text-muted-foreground'}>
            {formatMoney(row.debtSnapshot.outstandingTotal)}
          </RowMoney>
        );
      },
    },
  ];

  return (
    <Card data-print-keep>
      <CardHeader>
        <CardTitle>Kunlik ko'rsatkichlar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Qatorni bossangiz o'sha kunning to'liq hisoboti ochiladi.
        </p>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.date}
          onRowClick={onSelectDay}
          emptyState="Bu oyda ma'lumot yo'q."
        />
      </CardContent>
    </Card>
  );
}

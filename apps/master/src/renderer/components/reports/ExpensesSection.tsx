import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { MoneyCell } from '@/components/data/MoneyCell';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Row, Section } from './report-helpers';

type ExpenseItem = DailyReport['expenses']['items'][number];

export function ExpensesSection({ report }: { report: DailyReport }) {
  const columns: DataTableColumn<ExpenseItem>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'category',
      header: 'Turkum',
      cell: (row) => <span className="font-medium">{row.categoryName}</span>,
    },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => <span className="text-muted-foreground">{row.reason}</span>,
    },
    {
      key: 'amount',
      header: 'Imzoli summa',
      align: 'right',
      cell: (row) => (
        <MoneyCell
          value={row.signedAmount}
          className={cn(row.status === 'REVERSAL' && 'text-destructive')}
        />
      ),
    },
  ];

  return (
    <Section
      title="Xarajatlar"
      description="Kiritilgan chiqimlar, qaytarilgan satrlar va turkumlar bo'yicha yig'indi."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        <DataTable
          columns={columns}
          data={report.expenses.items}
          rowKey={(row) => row.id}
          emptyState={<span className="text-sm">Tanlangan sana uchun chiqimlar topilmadi</span>}
        />

        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Qisqa hisob
            </div>
            <Row label="Kiritilgan chiqim" value={formatMoney(report.checks.expenses.recordedExpense)} />
            <Row
              label="Bekor qilingan"
              value={formatMoney(report.checks.expenses.reversalAmount)}
              tone={Number(report.checks.expenses.reversalAmount) > 0 ? 'warning' : 'muted'}
            />
            <Row label="Netto chiqim" value={formatMoney(report.expenses.net)} bold />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Turkumlar bo'yicha
            </div>
            {report.expenses.byCategory.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">Turkumlar bo'yicha chiqim yo'q</div>
            ) : (
              report.expenses.byCategory.map((row) => (
                <Row key={row.categoryId} label={row.categoryName} value={formatMoney(row.amount)} />
              ))
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

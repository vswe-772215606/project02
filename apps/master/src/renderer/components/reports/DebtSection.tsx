import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { MoneyCell } from '@/components/data/MoneyCell';
import { formatMoney } from '@/lib/format';
import { ReportStatusBadge, Section, StatTile, sumMoney } from './report-helpers';
import { HandCoins, ArrowDownToLine, ArrowUpFromLine, Users } from 'lucide-react';

type DebtRow = DailyReport['debtLedger'][number];

export function DebtSection({ report }: { report: DailyReport }) {
  const debtTotals = useMemo(
    () => ({
      original: sumMoney(report.debtLedger.map((item) => item.originalAmount)),
      repaidToday: sumMoney(report.debtLedger.map((item) => item.repaidToday)),
      totalRepaid: sumMoney(report.debtLedger.map((item) => item.totalRepaid)),
      remaining: sumMoney(report.debtLedger.map((item) => item.remainingAmount)),
    }),
    [report.debtLedger],
  );

  const columns: DataTableColumn<DebtRow>[] = [
    {
      key: 'openedAt',
      header: 'Ochilgan',
      cell: (row) => <DateTimeCell value={row.openedAt} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'order',
      header: 'Buyurtma',
      cell: (row) => <span className="font-medium tabular-nums">#{row.orderNumber}</span>,
    },
    {
      key: 'debtor',
      header: 'Mijoz',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium">{row.debtorName}</span>
          {row.debtorPhone && (
            <span className="text-xs text-muted-foreground">{row.debtorPhone}</span>
          )}
        </div>
      ),
    },
    {
      key: 'original',
      header: 'Nasiya',
      align: 'right',
      cell: (row) => <MoneyCell value={row.originalAmount} />,
    },
    {
      key: 'repaidToday',
      header: 'Bugun qaytgan',
      align: 'right',
      cell: (row) => (
        <MoneyCell value={row.repaidToday} className={Number(row.repaidToday) > 0 ? 'text-success' : ''} />
      ),
    },
    {
      key: 'totalRepaid',
      header: 'Jami qaytgan',
      align: 'right',
      cell: (row) => <MoneyCell value={row.totalRepaid} />,
    },
    {
      key: 'remaining',
      header: 'Qoldiq',
      align: 'right',
      cell: (row) => (
        <MoneyCell value={row.remainingAmount} className={Number(row.remainingAmount) > 0 ? 'text-destructive' : ''} />
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => <ReportStatusBadge status={row.status} />,
    },
  ];

  return (
    <Section title="Nasiyalar" description="Bugungi nasiya harakati va kunni yopgan qarz qoldig'i.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <StatTile
          label="Bugun ochilgan"
          value={formatMoney(report.debtSnapshot.openedTodayAmount)}
          hint={`${report.debtSnapshot.openedTodayCount} ta yangi nasiya`}
          icon={ArrowUpFromLine}
          tone={Number(report.debtSnapshot.openedTodayAmount) > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Bugun qaytgan"
          value={formatMoney(report.debtSnapshot.repaidTodayAmount)}
          hint={`${report.debtSnapshot.repayments.length} ta to'lov`}
          icon={ArrowDownToLine}
          tone={Number(report.debtSnapshot.repaidTodayAmount) > 0 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Qarz qoldig'i"
          value={formatMoney(report.debtSnapshot.outstandingTotal)}
          hint="Jami kutilayotgan qarz"
          icon={HandCoins}
          tone={Number(report.debtSnapshot.outstandingTotal) > 0 ? 'danger' : 'good'}
        />
        <StatTile
          label="Jadval bo'yicha jami"
          value={formatMoney(debtTotals.remaining)}
          hint={`${report.debtLedger.length} ta nasiya ko'rsatilgan`}
          icon={Users}
        />
      </div>

      <DataTable
        columns={columns}
        data={report.debtLedger}
        rowKey={(row) => row.debtId}
        emptyState={<span className="text-sm">Bu sana uchun nasiya harakati topilmadi</span>}
      />
    </Section>
  );
}

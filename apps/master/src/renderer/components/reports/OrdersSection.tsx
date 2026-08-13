import { useMemo } from 'react';
import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { FieldLabel, RowMoney } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import { ReportStatusBadge, Section, sumMoney } from './report-helpers';

type OrderRow = DailyReport['ordersTable'][number];

export function OrdersSection({ report }: { report: DailyReport }) {
  const totals = useMemo(
    () => ({
      gross: sumMoney(report.ordersTable.map((item) => item.gross)),
      discount: sumMoney(report.ordersTable.map((item) => item.discount)),
      net: sumMoney(report.ordersTable.map((item) => item.net)),
      cash: sumMoney(report.ordersTable.map((item) => item.cash)),
      card: sumMoney(report.ordersTable.map((item) => item.card)),
      debt: sumMoney(report.ordersTable.map((item) => item.debt)),
    }),
    [report.ordersTable],
  );

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.at} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'order',
      header: 'Buyurtma',
      cell: (row) => <span className="font-medium tabular-nums">#{row.orderNumber}</span>,
    },
    {
      key: 'table',
      header: 'Joy',
      cell: (row) => <span>{row.tableName ?? 'Olib ketish'}</span>,
    },
    {
      key: 'waiter',
      header: 'Ofitsiant',
      cell: (row) => <span className="text-muted-foreground">{row.waiterName}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => <ReportStatusBadge status={row.status} />,
    },
    {
      key: 'gross',
      header: 'Yalpi',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.gross)}</RowMoney>,
    },
    {
      key: 'discount',
      header: 'Chegirma',
      align: 'right',
      cell: (row) => <RowMoney className="text-muted-foreground">{formatMoney(row.discount)}</RowMoney>,
    },
    {
      key: 'net',
      header: 'Sof',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.net)}</RowMoney>,
    },
    {
      key: 'cash',
      header: 'Naqd',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.cash)}</RowMoney>,
    },
    {
      key: 'card',
      header: 'Karta',
      align: 'right',
      cell: (row) => <RowMoney>{formatMoney(row.card)}</RowMoney>,
    },
    {
      key: 'debt',
      header: 'Qarz',
      align: 'right',
      cell: (row) => (
        <RowMoney className={Number(row.debt) > 0 ? 'text-warning' : ''}>{formatMoney(row.debt)}</RowMoney>
      ),
    },
  ];

  return (
    <Section title="Buyurtmalar ro'yxati">
      <DataTable
        columns={columns}
        data={report.ordersTable}
        rowKey={(row) => row.orderId}
        emptyState={<span className="text-sm">Tanlangan sana uchun buyurtmalar topilmadi</span>}
      />
      {report.ordersTable.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 bg-field-raised px-4 py-2 sm:grid-cols-6">
          <Totaled label="Yalpi" value={formatMoney(totals.gross)} />
          <Totaled label="Chegirma" value={formatMoney(totals.discount)} />
          <Totaled label="Sof" value={formatMoney(totals.net)} bold />
          <Totaled label="Naqd" value={formatMoney(totals.cash)} />
          <Totaled label="Karta" value={formatMoney(totals.card)} />
          <Totaled label="Qarz" value={formatMoney(totals.debt)} />
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

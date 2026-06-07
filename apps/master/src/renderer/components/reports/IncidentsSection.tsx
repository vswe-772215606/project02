import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { MoneyCell } from '@/components/data/MoneyCell';
import { formatMoney } from '@/lib/format';
import { Section, sumMoney } from './report-helpers';

type CancelRow = DailyReport['cancellations'][number];
type WalkoutRow = DailyReport['walkouts'][number];

export function IncidentsSection({ report }: { report: DailyReport }) {
  const cancelCols: DataTableColumn<CancelRow>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.canceledAt} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'order',
      header: 'Buyurtma',
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.orderId.slice(-6).toUpperCase()}</span>,
      width: '110px',
    },
    {
      key: 'by',
      header: 'Kim bekor qildi',
      cell: (row) => <span>{row.canceledBy}</span>,
    },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => <span className="text-muted-foreground">{row.reason || '—'}</span>,
    },
  ];

  const walkoutTotal = sumMoney(report.walkouts.map((w) => w.amount));
  const walkoutCols: DataTableColumn<WalkoutRow>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.markedAt} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'order',
      header: 'Buyurtma',
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.orderId.slice(-6).toUpperCase()}</span>,
      width: '110px',
    },
    {
      key: 'by',
      header: 'Kim belgiladi',
      // PRD 13: prefer the resolved name (markedByName) — pre-T6 this was
      // always the literal 'unknown'. Fall back to markedBy for any in-flight
      // payload from an older backend.
      cell: (row) => <span>{row.markedByName ?? row.markedBy ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.amount} className="text-destructive" />,
    },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => <span className="text-muted-foreground">{row.reason || '—'}</span>,
    },
  ];

  return (
    <Section title="Bekor va to'lamay ketgan">
      <div className="space-y-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Bekor qilingan ({report.cancellations.length} ta)
          </div>
          <DataTable
            columns={cancelCols}
            data={report.cancellations}
            rowKey={(row) => row.orderId}
            emptyState={<span className="text-sm">Bu sana uchun bekor qilingan buyurtmalar yo&apos;q</span>}
          />
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-baseline justify-between">
            <span>To&apos;lamay ketgan ({report.walkouts.length} ta)</span>
            {report.walkouts.length > 0 && (
              <span className="text-xs font-normal text-destructive tabular-nums normal-case tracking-normal">
                Jami: {formatMoney(walkoutTotal)}
              </span>
            )}
          </div>
          <DataTable
            columns={walkoutCols}
            data={report.walkouts}
            rowKey={(row) => row.orderId}
            emptyState={<span className="text-sm">Bu sana uchun to&apos;lamay ketgan buyurtmalar yo&apos;q</span>}
          />
        </div>
      </div>
    </Section>
  );
}

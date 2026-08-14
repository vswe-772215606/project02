import type { DailyReport } from '@/api/reports';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { FieldLabel } from '@/components/blocks';
import { Section } from './report-helpers';

type CancelRow = DailyReport['cancellations'][number];

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
      cell: (row) => <span className="font-mono text-[13px] text-muted-foreground">{row.orderId.slice(-6).toUpperCase()}</span>,
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

  return (
    <Section title="Bekor va to'lamay ketgan">
      <div className="space-y-5">
        <div>
          <FieldLabel className="mb-2">Bekor qilingan ({report.cancellations.length} ta)</FieldLabel>
          <DataTable
            columns={cancelCols}
            data={report.cancellations}
            rowKey={(row) => row.orderId}
            emptyState={<span className="text-sm">Bu sana uchun bekor qilingan buyurtmalar yo&apos;q</span>}
          />
        </div>
      </div>
    </Section>
  );
}

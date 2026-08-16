import { Panel } from '@/components/layout/Screen';
import { Row, RowHeader, RowMoney, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { WaiterTodayStat } from '@/api/users';

const COLUMNS = '1fr 96px 130px 130px';

/**
 * Today's waiter performance — the panel's resting content when nobody is
 * selected. Real information someone reads every day; putting it here beats
 * an empty "pick someone" placeholder, and it steps aside the moment a row
 * is selected.
 */
export function TodayStatsPanel({ date, items }: { date: string; items: WaiterTodayStat[] }) {
  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">Bugungi ko'rsatkich</div>
          <div className="text-[13px] text-muted-foreground">{date}</div>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <RowHeader columns={COLUMNS}>
            <span>Ofitsiant</span>
            <span className="text-right">Buyurtma</span>
            <span className="text-right">Savdo</span>
            <span className="text-right">Xizmat haqi</span>
          </RowHeader>

          {items.map((row) => (
            <Row key={row.waiterId} columns={COLUMNS}>
              <span className="min-w-0 truncate">{row.waiterName}</span>
              <span className="text-right text-[14.5px] tabular-nums">{row.orders}</span>
              <RowMoney>{formatMoney(row.revenue)}</RowMoney>
              <RowMoney>{formatMoney(row.serviceEarned)}</RowMoney>
            </Row>
          ))}
        </Seam>
      </div>
    </Panel>
  );
}

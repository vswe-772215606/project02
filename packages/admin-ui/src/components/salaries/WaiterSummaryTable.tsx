import type { ServiceChargeMatrix } from '@/api/finance';
import { Row, RowHeader, RowMoney, Seam } from '@/components/blocks';

const COLUMNS = '1fr 170px 200px 220px';

/** Same zero-as-dash convention as the original page: a day with no service
 * charge reads as "—", not "0". Kept verbatim — this is a display choice,
 * not a math change. */
function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

/**
 * Ofitsiantlar bo'yicha jami — the primary content of the page.
 *
 * Full width, money at the 17px floor via `RowMoney`. This is the number an
 * owner opens the page to see; the day-by-day matrix beneath it is
 * supporting detail, not the headline.
 */
export function WaiterSummaryTable({
  matrix,
  isLoading,
}: {
  matrix: ServiceChargeMatrix | undefined;
  isLoading: boolean;
}) {
  if (!matrix || matrix.waiters.length === 0) {
    return (
      <Seam className="content-start">
        <div className="flex items-center justify-center bg-field px-pad py-16 text-center text-[14px] text-muted-foreground">
          {isLoading ? 'Yuklanmoqda...' : 'Bu davrda yopilgan buyurtmalar topilmadi'}
        </div>
      </Seam>
    );
  }

  const totalOrders = matrix.waiters.reduce((s, w) => s + w.orderCount, 0);

  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Ofitsiant</span>
        <span className="text-right">Buyurtmalar</span>
        <span className="text-right">O'rtacha (1 buyurtma)</span>
        <span className="text-right">Jami xizmat haqi</span>
      </RowHeader>

      {matrix.waiters.map((row) => {
        const total = Number(row.total);
        const avg = row.orderCount > 0 ? total / row.orderCount : 0;
        return (
          <Row key={row.waiterId} columns={COLUMNS}>
            <span className="min-w-0 truncate font-semibold">{row.waiterName}</span>
            <span className="text-right text-[15px] font-semibold tabular-nums">{row.orderCount}</span>
            <RowMoney className="text-muted-foreground">{fmtMoney(avg)}</RowMoney>
            <RowMoney>
              {fmtMoney(row.total)} <span className="text-[13px] font-normal text-muted-foreground">so'm</span>
            </RowMoney>
          </Row>
        );
      })}

      <Row inert columns={COLUMNS}>
        <span className="font-semibold uppercase tracking-[0.05em]">Jami</span>
        <span className="text-right text-[15px] font-semibold tabular-nums">{totalOrders}</span>
        <span />
        <RowMoney>
          {fmtMoney(matrix.grandTotal)} <span className="text-[13px] font-normal">so'm</span>
        </RowMoney>
      </Row>
    </Seam>
  );
}

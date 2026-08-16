import { MoneyField, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';

type PnlSummaryTilesProps = {
  /** = netSales — same canonical field the detail sections below prove. */
  revenue: string;
  cogs: string;
  operatingExpense: string;
  profit: string;
};

/**
 * The headline P&L figures, led at the top of the report.
 *
 * The daily and the Umumiy (range) tabs share the exact same `pnl` shape
 * server-side (`{ revenue, cogs, operatingExpense, profit }`), so one tile
 * row serves both. Values are pass-through display of fields the server
 * already computed — `GrandSummarySection` (daily) and the P&L card
 * (Umumiy) below derive from the same source and must always agree; this
 * component performs no arithmetic of its own.
 */
export function PnlSummaryTiles({ revenue, cogs, operatingExpense, profit }: PnlSummaryTilesProps) {
  return (
    <Seam direction="row" wrap className="content-start">
      <MoneyField label="Sof savdo" value={formatMoney(revenue)} unit="so'm" />
      <MoneyField label="Tan narx" value={formatMoney(cogs)} unit="so'm" />
      <MoneyField label="Operatsion" value={formatMoney(operatingExpense)} unit="so'm" />
      <MoneyField
        label="Sof foyda"
        value={formatMoney(profit)}
        unit="so'm"
        note="Sotuv − tan narxi − chiqim"
      />
    </Seam>
  );
}

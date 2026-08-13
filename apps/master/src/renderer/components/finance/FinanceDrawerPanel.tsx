import { Panel } from '@/components/layout/Screen';
import { Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { FinanceDaily } from '@/api/finance';

const ROW_COLUMNS = '1fr 130px';

/**
 * The cash drawer, pinned.
 *
 * This is the ADMIN's actual question — what the till gained or lost today —
 * and it used to be the last of eight regions on the page. Here it is a
 * panel, so `Kassa o'zgarishi` sits in the foot and cannot scroll away.
 */
export function FinanceDrawerPanel({ data }: { data: FinanceDaily | undefined }) {
  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
        Yuklanmoqda…
      </div>
    );
  }

  const debtRepaid = Number(data.cashflow.debtRepaidCash) + Number(data.cashflow.debtRepaidCard);
  const expenseReturns = Number(data.cashflow.expenseReturns);
  const purchasesTotal = Number(data.outflow.purchasesTotal);
  const totalOut = Number(data.outflow.totalOut);
  const opExclPurchases = totalOut - purchasesTotal;
  const totalIn = Number(data.cashflow.totalIn);
  const movement = Number(data.drawer.movement);

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">Kassa</div>
          <div className="text-[13px] text-muted-foreground">Bugungi naqd pul harakati</div>
        </>
      }
      foot={
        <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
          <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Kassa o&apos;zgarishi</span>
          <span className="text-[22px] font-semibold tabular-nums">
            {movement >= 0 ? '+' : ''}
            {formatMoney(movement)}
          </span>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Row columns={ROW_COLUMNS}>
            <span>Naqd</span>
            <RowMoney>{formatMoney(data.cashflow.cashIn)}</RowMoney>
          </Row>
          <Row columns={ROW_COLUMNS}>
            <span>Karta</span>
            <RowMoney>{formatMoney(data.cashflow.cardIn)}</RowMoney>
          </Row>
          <Row columns={ROW_COLUMNS}>
            <span>Nasiya olindi</span>
            <RowMoney>{formatMoney(debtRepaid)}</RowMoney>
          </Row>
          {expenseReturns > 0 ? (
            <Row columns={ROW_COLUMNS}>
              <span>Avans qaytimi</span>
              <RowMoney>{formatMoney(expenseReturns)}</RowMoney>
            </Row>
          ) : null}
          <Row columns={ROW_COLUMNS}>
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Kelgan</span>
            <RowMoney className="text-settled">+{formatMoney(totalIn)}</RowMoney>
          </Row>
          <Row columns={ROW_COLUMNS}>
            <span>
              Ketgan
              <RowSub>
                Xaridlar {formatMoney(purchasesTotal)} · Chiqim (kassadan ketgan) {formatMoney(opExclPurchases)}
              </RowSub>
            </span>
            <RowMoney className="text-owed">-{formatMoney(totalOut)}</RowMoney>
          </Row>
        </Seam>
      </div>
    </Panel>
  );
}

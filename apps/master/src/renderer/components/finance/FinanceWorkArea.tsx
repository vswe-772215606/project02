import { useMemo } from 'react';

import { Chip, Field, FieldLabel, MoneyField, Row, RowHeader, RowMoney, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import type { FinanceDaily } from '@/api/finance';

type MealRowDisplay =
  | { type: 'category'; data: FinanceDaily['mealSalesByCategory'][number] }
  | { type: 'item'; data: FinanceDaily['mealSales'][number] };

const MEAL_COLUMNS = '1fr 64px 130px 130px';
const PURCHASE_COLUMNS = '120px 1fr 120px 130px';
const EXPENSE_COLUMNS = '1fr 120px 130px';
const DEBT_COLUMNS = '1fr 140px';

const REPAY_CHIP: Record<FinanceDaily['operatingExpenses'][number]['repayStatus'], { tone: ChipTone; label: string } | null> = {
  NOT_REPAYABLE: null,
  PENDING: { tone: 'live', label: 'Kutilmoqda' },
  PARTIAL: { tone: 'live', label: 'Qisman' },
  RETURNED: { tone: 'settled', label: 'Qaytarildi' },
  WRITTEN_OFF: { tone: 'owed', label: "Yo'qotildi" },
};

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <Field tone="raised" className="py-2">
      <FieldLabel>{title}</FieldLabel>
      {hint ? <div className="mt-0.5 text-[13px] text-muted-foreground">{hint}</div> : null}
    </Field>
  );
}

/**
 * The work area: today's sales, purchases, expenses and debt movement.
 *
 * "Sotuv" and "Chiqim" each named two different numbers on the old screen —
 * every occurrence here is qualified once (`(sof)` / `(yalpi)` /
 * `(xaridlarsiz)`) so the same word never carries two meanings on one screen.
 *
 * No profit anywhere in this file, at any grain. `pnl.profit` is never read,
 * and the "Sotilgan ovqatlar" breakdown stops at Sotuv/Tan narxi — the
 * per-dish `.profit` field is margin the same way the headline number is,
 * just in smaller print. Quantity, revenue and cost stay: ADMIN enters cost
 * prices in Ombor, so cost is theirs to see. Profit, at any grain, belongs to
 * Hisobot.
 */
export function FinanceWorkArea({ data, isLoading }: { data: FinanceDaily | undefined; isLoading: boolean }) {
  const mealRows = useMemo<MealRowDisplay[]>(() => {
    if (!data) return [];
    const itemsByCategory = new Map<string, FinanceDaily['mealSales']>();
    for (const item of data.mealSales) {
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    }
    const out: MealRowDisplay[] = [];
    for (const category of data.mealSalesByCategory) {
      out.push({ type: 'category', data: category });
      for (const item of itemsByCategory.get(category.categoryId) ?? []) {
        out.push({ type: 'item', data: item });
      }
    }
    return out;
  }, [data]);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-field px-pad py-16 text-center text-[14px] text-muted-foreground">
        {isLoading ? 'Yuklanmoqda…' : "Ma'lumot yo'q"}
      </div>
    );
  }

  return (
    <Seam className="content-start">
      <Seam direction="row" columns="1fr 1fr 1fr" className="shrink-0">
        <MoneyField
          label="Sotuv (sof)"
          value={formatMoney(data.pnl.revenue)}
          note={`${data.mealSalesTotal.qty} ta porsiya`}
        />
        <MoneyField
          label="Tan narxi"
          value={formatMoney(data.pnl.cogs)}
          note="Sotilgan ovqat tannarxi"
        />
        <MoneyField
          label="Chiqim (xaridlarsiz)"
          value={formatMoney(data.pnl.operatingExpense)}
          note="Xaridlardan tashqari"
        />
      </Seam>

      {/* ─── Sotilgan ovqatlar ─────────────────────────────────────── */}
      <SectionHead
        title="Sotilgan ovqatlar"
        hint="Har bir taom o'z narxida — Sotuv (yalpi) xizmat haqi bilan va chegirmagacha, yuqoridagi Sotuv (sof)dan farq qiladi"
      />
      <RowHeader columns={MEAL_COLUMNS}>
        <span>Ovqat / Kategoriya</span>
        <span className="text-right">Soni</span>
        <span className="text-right">Sotuv (yalpi)</span>
        <span className="text-right">Tan narxi</span>
      </RowHeader>
      {mealRows.length === 0 ? (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">Bugun sotuv yo&apos;q</div>
      ) : (
        mealRows.map((row) =>
          row.type === 'category' ? (
            <Row key={`cat-${row.data.categoryId}`} columns={MEAL_COLUMNS} className="bg-field-raised">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {row.data.categoryName}
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums">{row.data.qty}</span>
              <RowMoney>{formatMoney(row.data.revenue)}</RowMoney>
              <RowMoney>{formatMoney(row.data.cogs)}</RowMoney>
            </Row>
          ) : (
            <Row key={row.data.menuItemId} columns={MEAL_COLUMNS}>
              <span className="min-w-0 truncate pl-4">
                {row.data.menuItemName}
                {row.data.isService ? <RowSub>xizmat</RowSub> : null}
              </span>
              <span className="text-right text-[13px] tabular-nums">{row.data.qty}</span>
              <RowMoney>{formatMoney(row.data.revenue)}</RowMoney>
              <RowMoney className="text-muted-foreground">{formatMoney(row.data.cogs)}</RowMoney>
            </Row>
          ),
        )
      )}
      {data.mealSalesTotal.qty > 0 ? (
        <Row columns={MEAL_COLUMNS}>
          <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Jami</span>
          <span className="text-right text-[13px] font-semibold tabular-nums">{data.mealSalesTotal.qty}</span>
          <RowMoney>{formatMoney(data.mealSalesTotal.revenue)}</RowMoney>
          <RowMoney>{formatMoney(data.mealSalesTotal.cogs)}</RowMoney>
        </Row>
      ) : null}

      {/* ─── Xaridlar ──────────────────────────────────────────────── */}
      {data.ingredientPurchases.length > 0 ? (
        <>
          <SectionHead
            title="Xaridlar"
            hint="Bu summa omborga kirdi. Foydaga sotilgandan keyin tan narxi sifatida kiradi."
          />
          <RowHeader columns={PURCHASE_COLUMNS}>
            <span>Vaqti</span>
            <span>Mahsulot</span>
            <span className="text-right">Miqdor</span>
            <span className="text-right">Summa</span>
          </RowHeader>
          {data.ingredientPurchases.map((purchase) => (
            <Row key={purchase.id} columns={PURCHASE_COLUMNS}>
              <span className="text-[13px] text-muted-foreground">{formatDateTime(purchase.occurredAt)}</span>
              <span className="min-w-0 truncate">
                {purchase.ingredientName}
                {purchase.supplierNote ? <RowSub>{purchase.supplierNote}</RowSub> : null}
              </span>
              <span className="text-right text-[13px] tabular-nums">
                {formatQuantity(purchase.quantityBuyUnit, purchase.buyUnit)}
              </span>
              <RowMoney>{formatMoney(purchase.totalCostUzs)}</RowMoney>
            </Row>
          ))}
          <Row columns={PURCHASE_COLUMNS}>
            <span className="col-span-3 text-[13px] font-semibold uppercase tracking-[0.06em]">
              Jami xaridlar ({data.ingredientPurchasesTotal.count} ta)
            </span>
            <RowMoney>{formatMoney(data.ingredientPurchasesTotal.amount)}</RowMoney>
          </Row>
        </>
      ) : null}

      {/* ─── Chiqimlar ─────────────────────────────────────────────── */}
      {data.operatingExpenses.length > 0 ? (
        <>
          <SectionHead title="Chiqimlar (xaridlarsiz)" hint="Ijara, maosh, kommunal va h.k." />
          <RowHeader columns={EXPENSE_COLUMNS}>
            <span>Sabab</span>
            <span>Holat</span>
            <span className="text-right">Summa</span>
          </RowHeader>
          {data.operatingExpenses.map((expense) => {
            const chip = expense.repayable ? REPAY_CHIP[expense.repayStatus] : null;
            return (
              <Row key={expense.id} columns={EXPENSE_COLUMNS}>
                <span className="min-w-0 truncate">
                  {expense.reason}
                  <RowSub>
                    {formatDateTime(expense.occurredAt)} · {expense.categoryName}
                  </RowSub>
                </span>
                <span>{chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}</span>
                <RowMoney className={expense.status === 'REVERSAL' ? 'text-owed' : undefined}>
                  {expense.status === 'REVERSAL' ? '-' : ''}
                  {formatMoney(expense.amount)}
                </RowMoney>
              </Row>
            );
          })}
          <Row columns={EXPENSE_COLUMNS}>
            <span className="col-span-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
              Chiqim (xaridlarsiz) ({data.operatingExpensesTotal.count} ta)
            </span>
            <RowMoney>{formatMoney(data.operatingExpensesTotal.operating)}</RowMoney>
          </Row>
          {Number(data.operatingExpensesTotal.gross) !== Number(data.operatingExpensesTotal.operating) ? (
            <div className="bg-field px-pad py-1.5 text-[13px] text-muted-foreground">
              Brutto: {formatMoney(data.operatingExpensesTotal.gross)} so&apos;m
            </div>
          ) : null}
        </>
      ) : null}

      {/* ─── Nasiya (bugun) ────────────────────────────────────────── */}
      <SectionHead title="Nasiya (bugun)" />
      <Row columns={DEBT_COLUMNS}>
        <span>
          Bugun ochilgan
          <RowSub>{data.debtToday.openedCount} ta</RowSub>
        </span>
        <RowMoney className="text-owed">+{formatMoney(data.debtToday.openedAmount)}</RowMoney>
      </Row>
      <Row columns={DEBT_COLUMNS}>
        <span>
          Bugun olingan to&apos;lov
          <RowSub>{data.debtToday.collectedCount} ta</RowSub>
        </span>
        <RowMoney className="text-settled">{formatMoney(data.debtToday.collectedAmount)}</RowMoney>
      </Row>
      <Row columns={DEBT_COLUMNS}>
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Jami ochiq qoldiq</span>
        <RowMoney>{formatMoney(data.debtToday.lifetimeOutstanding)}</RowMoney>
      </Row>
    </Seam>
  );
}

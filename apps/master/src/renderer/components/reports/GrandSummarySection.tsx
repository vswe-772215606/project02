import type { DailyReport } from '@/api/reports';
import { FieldLabel } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import { Section, sumMoney } from './report-helpers';
import { cn } from '@/lib/utils';

type RowSpec = {
  label: string;
  value: string;
  emphasis?: 'bold' | 'total' | 'subtotal';
  tone?: 'income' | 'expense' | 'warn' | 'good' | 'danger' | 'muted';
  hint?: string;
};

/**
 * Kun yakuniy hisoboti — barcha raqamlar bir joyda. Mijozning kirim/chiqim,
 * pul oqimi va sof foydasini ko'rsatadi.
 */
export function GrandSummarySection({ report }: { report: DailyReport }) {
  const walkoutTotal = sumMoney(report.walkouts.map((w) => w.amount));
  const pnl = report.ledger.pnl;

  const incomeRows: RowSpec[] = [
    { label: 'Yalpi sotuv', value: report.sales.grossSales, tone: 'income' },
    { label: 'Chegirmalar', value: `-${report.sales.discounts}`, tone: 'muted' },
    { label: 'Sof ovqat savdosi', value: report.sales.netSales, emphasis: 'subtotal' },
    { label: 'Xizmat haqi (ofitsiantlarga)', value: report.sales.serviceCharge, tone: 'muted' },
    { label: 'Chek summasi', value: report.checks.salesVsPayments.billedTotal, emphasis: 'bold' },
  ];

  const cashflowInRows: RowSpec[] = [
    { label: 'Naqd (buyurtmalardan)', value: report.cashflow.orderCash },
    { label: 'Karta (buyurtmalardan)', value: report.cashflow.orderCard },
    { label: 'Qarz qaytimi (naqd)', value: report.cashflow.debtRepaymentsCash, tone: 'good' },
    { label: 'Qarz qaytimi (karta)', value: report.cashflow.debtRepaymentsCard, tone: 'good' },
    { label: 'Jami kelgan pul', value: report.cashflow.realCashIn, emphasis: 'bold' },
    { label: 'Qarzga sotildi', value: report.sales.debtSales, tone: 'warn', hint: 'Bugun kelishilgan, hali to\'lanmagan' },
  ];

  const expenseRows: RowSpec[] = [
    { label: 'Kiritilgan chiqim', value: report.expenses.gross, tone: 'expense' },
    // Same-day reversals only — cross-day reversals (prior-day purchase deleted
    // today) don't return cash today, so they're excluded from the cash-out.
    { label: 'Bekor qilingan (shu kun)', value: `-${report.checks.expenses.sameDayReversalAmount}`, tone: 'muted' },
    { label: 'Jami chiqim (kassadan ketgan)', value: report.cashflow.cashOut, emphasis: 'bold', tone: 'expense' },
  ];

  if (report.expenses.byCategory.length > 0) {
    expenseRows.push(
      ...report.expenses.byCategory.map((c) => ({
        label: `  • ${c.categoryName}`,
        value: c.amount,
        tone: 'muted' as const,
      })),
    );
  }

  const resultRows: RowSpec[] = [
    // Sof foyda = sotuv − tan narxi − chiqim. Hammasi alohida ko'rsatilgan
    // bo'lsa, pastdagi raqam ravshan to'g'ri kelishi.
    { label: 'Sotuv', value: pnl.revenue, tone: 'income' },
    { label: '− Tan narxi', value: `-${pnl.cogs}`, tone: 'muted' },
    { label: '− Chiqim', value: `-${pnl.operatingExpense}`, tone: 'muted' },
    {
      label: 'Sof foyda',
      value: pnl.profit,
      emphasis: 'total',
      tone: Number(pnl.profit) >= 0 ? 'good' : 'danger',
    },
    {
      label: 'Kassa o\'zgarishi',
      value: report.results.cashflowBasedNet,
      emphasis: 'total',
      tone: Number(report.results.cashflowBasedNet) >= 0 ? 'good' : 'danger',
    },
  ];

  const debtRows: RowSpec[] = [
    { label: 'Bugun ochilgan nasiya', value: report.debtSnapshot.openedTodayAmount, hint: `${report.debtSnapshot.openedTodayCount} ta yangi yozuv`, tone: 'warn' },
    { label: 'Bugun qaytarilgan', value: report.debtSnapshot.repaidTodayAmount, hint: `${report.debtSnapshot.repayments.length} ta to'lov`, tone: 'good' },
    { label: 'Jami qarz qoldig\'i', value: report.debtSnapshot.outstandingTotal, emphasis: 'bold', tone: Number(report.debtSnapshot.outstandingTotal) > 0 ? 'danger' : 'good' },
  ];

  const orderRows: RowSpec[] = [
    { label: 'Yopilgan buyurtmalar', value: String(report.sales.closedOrders) },
    { label: 'Bekor qilingan', value: String(report.sales.canceledOrders), tone: report.sales.canceledOrders > 0 ? 'warn' : 'muted' },
    { label: "To'lamay ketgan", value: `${report.sales.walkoutOrders} (${formatMoney(walkoutTotal)} so'm)`, tone: report.sales.walkoutOrders > 0 ? 'danger' : 'muted' },
  ];

  return (
    <Section title="Yakuniy hisobot">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Group title="Savdo / Daromad" rows={incomeRows} />
        <Group title="Kassa kirimi" rows={cashflowInRows} />
        <Group title="Chiqimlar" rows={expenseRows} />
        <Group title="Nasiya holati" rows={debtRows} />
        <Group title="Buyurtmalar soni" rows={orderRows} />
        <Group title="Yakuniy natija" rows={resultRows} highlight />
      </div>

      {/* Single-line bottom strip with the headline number — easy to spot in print */}
      <div className="mt-6 border-t pt-4 flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
        <FieldLabel>Bugungi sof foyda</FieldLabel>
        <div
          className={cn(
            'text-3xl font-bold tabular-nums leading-none',
            Number(pnl.profit) > 0 && 'text-success',
            Number(pnl.profit) < 0 && 'text-destructive',
          )}
        >
          {formatMoney(pnl.profit)} <span className="text-base text-muted-foreground font-normal">so&apos;m</span>
        </div>
      </div>
    </Section>
  );
}

function Group({ title, rows, highlight }: { title: string; rows: RowSpec[]; highlight?: boolean }) {
  return (
    <div className={cn(highlight && 'bg-field-raised p-4 -m-1')}>
      <FieldLabel className="mb-2">{title}</FieldLabel>
      <div className="space-y-0">
        {rows.map((row, idx) => (
          <SummaryRow key={`${row.label}-${idx}`} row={row} />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ row }: { row: RowSpec }) {
  const numeric = Number(row.value.replace(/^-/, ''));
  const isNegative = row.value.startsWith('-');
  const display = isNegative ? `-${formatMoney(numeric)}` : formatMoney(row.value);

  const isMoney = !/^[0-9]+ \(/.test(row.value) && !/^[0-9]+$/.test(row.value);
  const valueText = isMoney ? display : row.value;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <div
          className={cn(
            'text-sm',
            row.emphasis === 'total' && 'font-semibold',
            row.tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {row.label}
        </div>
        {row.hint && <div className="mt-0.5 text-[13px] text-muted-foreground">{row.hint}</div>}
      </div>
      <span
        className={cn(
          'text-[17px] tabular-nums whitespace-nowrap',
          (row.emphasis === 'bold' || row.emphasis === 'subtotal') && 'font-semibold',
          row.emphasis === 'total' && 'text-lg font-bold',
          row.tone === 'good' && 'text-success',
          row.tone === 'warn' && 'text-warning',
          row.tone === 'danger' && 'text-destructive',
          row.tone === 'expense' && 'text-warning',
          row.tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {valueText}
      </span>
    </div>
  );
}

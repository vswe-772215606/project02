import type { DailyReport } from '@/api/reports';
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
 * One consolidated P&L block at the bottom of the daily report. Designed to
 * be the single page a chayxana owner can hand to their accountant: every
 * income/expense flow + the final net result, with no exceptions.
 *
 * Numbers come from the same /api/reports/daily payload everything else
 * uses — no client-side recomputation that could drift from the master.
 */
export function GrandSummarySection({ report }: { report: DailyReport }) {
  const walkoutTotal = sumMoney(report.walkouts.map((w) => w.amount));

  const incomeRows: RowSpec[] = [
    { label: 'Brutto savdo', value: report.sales.grossSales, tone: 'income' },
    { label: 'Chegirmalar', value: `-${report.sales.discounts}`, tone: 'muted', hint: 'Faol chegirmalar bo\'yicha kamaytirilgan summa' },
    { label: 'Sof ovqat savdosi', value: report.sales.netSales, emphasis: 'subtotal' },
    { label: 'Xizmat haqi (ofitsiantlarga)', value: report.sales.serviceCharge, tone: 'muted', hint: 'Buyurtmaga qo\'shilgan, mijoz to\'lagan' },
    { label: 'Yakuniy chek summasi', value: report.checks.salesVsPayments.billedTotal, emphasis: 'bold', hint: 'Sof savdo + xizmat haqi' },
  ];

  const cashflowInRows: RowSpec[] = [
    { label: 'Naqd (buyurtmalardan)', value: report.cashflow.orderCash },
    { label: 'Karta (buyurtmalardan)', value: report.cashflow.orderCard },
    { label: 'Nasiya qaytimi (naqd)', value: report.cashflow.debtRepaymentsCash, tone: 'good' },
    { label: 'Nasiya qaytimi (karta)', value: report.cashflow.debtRepaymentsCard, tone: 'good' },
    { label: 'Real kassa kirimi', value: report.cashflow.realCashIn, emphasis: 'bold' },
    { label: 'Qarzga sotildi (kelajakka)', value: report.sales.debtSales, tone: 'warn', hint: 'Bugun kelishilgan, lekin hali to\'lanmagan' },
  ];

  const expenseRows: RowSpec[] = [
    { label: 'Kiritilgan chiqim (brutto)', value: report.expenses.gross, tone: 'expense' },
    { label: 'Bekor qilingan chiqim', value: `-${report.checks.expenses.reversalAmount}`, tone: 'muted' },
    { label: 'Netto chiqim', value: report.expenses.net, emphasis: 'bold', tone: 'expense' },
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
    {
      label: 'Sof foyda (savdo asosida)',
      value: report.results.salesBasedProfit,
      emphasis: 'total',
      tone: Number(report.results.salesBasedProfit) >= 0 ? 'good' : 'danger',
      hint: 'Sof savdo − netto chiqim',
    },
    {
      label: 'Kassa harakati (real)',
      value: report.results.cashflowBasedNet,
      emphasis: 'total',
      tone: Number(report.results.cashflowBasedNet) >= 0 ? 'good' : 'danger',
      hint: 'Real tushum − netto chiqim',
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
    <Section
      title="Yakuniy hisobot — barcha raqamlar bir joyda"
      description="Bugungi kun bo'yicha to'liq pul oqimi va P&L. Buxgalterga topshirish uchun yetarli."
    >
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
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Bugungi sof foyda
        </div>
        <div
          className={cn(
            'text-3xl font-bold tabular-nums leading-none',
            Number(report.results.salesBasedProfit) > 0 && 'text-success',
            Number(report.results.salesBasedProfit) < 0 && 'text-destructive',
          )}
        >
          {formatMoney(report.results.salesBasedProfit)} <span className="text-base text-muted-foreground font-normal">so&apos;m</span>
        </div>
      </div>
    </Section>
  );
}

function Group({ title, rows, highlight }: { title: string; rows: RowSpec[]; highlight?: boolean }) {
  return (
    <div className={cn(highlight && 'rounded-lg border border-primary/30 bg-primary/5 p-4 -m-1')}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </div>
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
        {row.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{row.hint}</div>}
      </div>
      <span
        className={cn(
          'text-sm tabular-nums whitespace-nowrap',
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

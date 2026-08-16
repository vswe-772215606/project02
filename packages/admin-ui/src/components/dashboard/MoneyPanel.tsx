import { useNavigate } from 'react-router-dom';

import { Panel } from '@/components/layout/Screen';
import { MoneyField, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type { FinanceDaily } from '@/api/finance';

/**
 * Today's money, at a glance. No Sof foyda here on purpose — profit is
 * Hisobot's to show (OWNER only); Bugun is ADMIN's front door and stays to
 * the four operational figures the till can settle from.
 */
export function MoneyPanel({ finance }: { finance: FinanceDaily | undefined }) {
  const navigate = useNavigate();
  const outstandingDebt = finance ? Number(finance.debtToday.lifetimeOutstanding) : 0;

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">Bugungi pul</div>}
      foot={
        <Button variant="secondary" className="w-full" onClick={() => navigate('/finance')}>
          Kunlik moliya →
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <MoneyField
            label="Savdo"
            value={finance ? formatMoney(finance.pnl.revenue) : '—'}
            unit="so'm"
          />
          <MoneyField
            label="Kassada"
            value={finance ? formatMoney(finance.drawer.movement) : '—'}
            unit="so'm"
          />
          <MoneyField
            label="Nasiya qoldiq"
            value={finance ? formatMoney(finance.debtToday.lifetimeOutstanding) : '—'}
            unit="so'm"
            tone={outstandingDebt > 0 ? 'owed' : 'default'}
          />
          <MoneyField
            label="Chiqim"
            value={finance ? formatMoney(finance.pnl.operatingExpense) : '—'}
            unit="so'm"
          />
        </Seam>
      </div>
    </Panel>
  );
}

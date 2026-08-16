import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { financeApi } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Input } from '@/components/ui/input';
import { FinanceWorkArea } from '@/components/finance/FinanceWorkArea';
import { FinanceDrawerPanel } from '@/components/finance/FinanceDrawerPanel';
import { tashkentDayKey } from '@/lib/format';

/**
 * Kunlik moliya — ADMIN's daily money screen.
 *
 * `pnl.profit` is never read here: Sof foyda is OWNER-only and lives in
 * Hisobot. The cash drawer — the number this page actually exists to answer —
 * is a pinned panel rather than the last of eight scrolling regions.
 */
export function FinancePage() {
  usePageTitle('Kunlik moliya');
  // Tashkent today key — matches backend bucketing regardless of host TZ.
  const [date, setDate] = useState(() => tashkentDayKey());

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'daily', date],
    queryFn: () => financeApi.daily(date),
    refetchInterval: 30_000,
  });

  return (
    <Screen
      title="Kunlik moliya"
      status={
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
          aria-label="Sana"
        />
      }
      panel={<FinanceDrawerPanel data={data} />}
    >
      <FinanceWorkArea data={data} isLoading={isLoading} />
    </Screen>
  );
}

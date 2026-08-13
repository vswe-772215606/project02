import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { expensesApi, type ExpenseItem } from '@/api/expenses';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyField, Seam } from '@/components/blocks';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ExpensePanel } from '@/components/expenses/ExpensePanel';
import { ExpenseCreateDialog } from '@/components/expenses/ExpenseCreateDialog';
import { ExpenseReverseDialog, type ReversalTarget } from '@/components/expenses/ExpenseReverseDialog';
import { ExpenseReturnDialog, type ReturnTarget } from '@/components/expenses/ExpenseReturnDialog';
import { ExpenseWriteOffDialog, type WriteOffTarget } from '@/components/expenses/ExpenseWriteOffDialog';
import { formatMoney } from '@/lib/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Chiqimlar — the day's expenses and the repayable-avans lifecycle.
 *
 * The three totals used to vanish the instant a search was typed. They are
 * computed from whatever's currently on screen now — the day's list or the
 * search results — so they never disappear, they just describe a different
 * set.
 */
export function ExpensesPage() {
  usePageTitle('Xarajatlar');

  const [date, setDate] = useState(localDateString);
  const [searchQuery, setSearchQuery] = useState('');
  const [openRepayableOnly, setOpenRepayableOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<WriteOffTarget | null>(null);
  const [reversalTarget, setReversalTarget] = useState<ReversalTarget | null>(null);

  const isSearching = searchQuery.trim().length > 0 || openRepayableOnly;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['expenses', date],
    queryFn: () => expensesApi.getByDate(date),
    enabled: !isSearching,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['expenses', 'search', searchQuery, openRepayableOnly],
    queryFn: () =>
      expensesApi.search({
        q: searchQuery.trim() || undefined,
        openRepayable: openRepayableOnly || undefined,
        limit: 200,
      }),
    enabled: isSearching,
  });

  const items: ExpenseItem[] = isSearching ? (searchData?.items ?? []) : (data?.items ?? []);
  const listLoading = isSearching ? searchLoading : isLoading;

  // Totals for whatever's currently visible — the day's list, or the search
  // results — so they never disappear the way the old stat tiles did.
  const totals = useMemo(() => {
    let net = 0;
    let reversal = 0;
    let pendingRepay = 0;
    for (const it of items) {
      net += Number(it.signedAmount);
      if (it.status === 'REVERSAL') reversal += Number(it.amount);
      if (it.repayable && (it.repayStatus === 'PENDING' || it.repayStatus === 'PARTIAL')) {
        pendingRepay += Number(it.remainingAmount ?? '0');
      }
    }
    return { net, reversal, pendingRepay };
  }, [items]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      <Screen
        title="Chiqimlar"
        status={
          <>
            {isFetching ? (
              <span className="text-[13px] text-muted-foreground">Yangilanmoqda…</span>
            ) : null}
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
              aria-label="Sana"
            />
            <Button onClick={() => setCreateOpen(true)}>Yangi xarajat</Button>
          </>
        }
        panel={
          selected ? (
            <ExpensePanel
              key={selected.id}
              item={selected}
              onReturn={setReturnTarget}
              onWriteOff={setWriteOffTarget}
              onReverse={setReversalTarget}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              {items.length > 0 ? 'Tafsilotlar uchun chiqimni tanlang' : "Bugun chiqimlar yo'q"}
            </div>
          )
        }
      >
        <Seam className="content-start">
          <Seam direction="row" columns="1fr 1fr 1fr" className="shrink-0">
            <MoneyField
              label="Jami chiqim"
              value={formatMoney(totals.net)}
              note={isSearching ? 'Qidiruv natijasi, kassadan ketgan' : 'Bugun kassadan ketgan'}
            />
            <MoneyField
              label="Kutilayotgan qaytim"
              value={formatMoney(totals.pendingRepay)}
              note={isSearching ? 'Qidiruv natijasidagi ochiq avanslar' : 'Bugungi ochiq avanslar'}
            />
            <MoneyField
              label="Bekor qilingan"
              value={formatMoney(totals.reversal)}
              note={isSearching ? 'Qidiruv natijasida' : 'Bugun bekor qilingan chiqimlar'}
            />
          </Seam>

          <ExpenseList
            items={items}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            openRepayableOnly={openRepayableOnly}
            onOpenRepayableOnlyChange={setOpenRepayableOnly}
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
            isLoading={listLoading}
          />
        </Seam>
      </Screen>

      <ExpenseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        date={date}
        onCreated={() => toast.success('Chiqim saqlandi')}
      />

      <ExpenseReverseDialog
        target={reversalTarget}
        onClose={() => setReversalTarget(null)}
        onSuccess={() => toast.success('Chiqim bekor qilindi')}
      />

      <ExpenseReturnDialog
        target={returnTarget}
        onClose={() => setReturnTarget(null)}
        onSuccess={() => toast.success('Qaytim yozildi')}
      />

      <ExpenseWriteOffDialog
        target={writeOffTarget}
        onClose={() => setWriteOffTarget(null)}
        onSuccess={() => toast.success("Yo'qotish belgilandi")}
      />
    </>
  );
}

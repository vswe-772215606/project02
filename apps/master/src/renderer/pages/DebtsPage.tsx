import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { debtsApi } from '@/api/debts';
import { ordersApi } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { DebtList } from '@/components/debts/DebtList';
import { DebtPanel, type DebtPanelData } from '@/components/debts/DebtPanel';

type DebtStatusFilter = '' | 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';

const STATUS_FILTERS: Array<{ value: DebtStatusFilter; label: string }> = [
  { value: '', label: 'Barchasi' },
  { value: 'OPEN', label: 'Ochiq' },
  { value: 'PARTIAL', label: 'Qisman' },
  { value: 'PAID', label: 'Yopilgan' },
  { value: 'WRITTEN_OFF', label: "Yo'qotilgan" },
];

/**
 * Qarzlar — the debt list and the repay loop.
 *
 * The old table's only route into repaying a debt was `onClick` on a `<tr>`:
 * invisible at rest and unreachable by keyboard. Selecting a `Row` here opens
 * the debtor in the panel, where repayment is entered on the same `Keypad`
 * idiom `StockPanel` uses for counting, not a modal dialog.
 */
export function DebtsPage() {
  usePageTitle('Qarzlar');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DebtStatusFilter>('');
  const [search, setSearch] = useState('');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [repayVersion, setRepayVersion] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['debts', status],
    queryFn: () => debtsApi.list({ status: status || undefined }),
  });

  const items = data?.items ?? [];
  const q = search.trim().toLowerCase();
  const filteredItems = q
    ? items.filter(
        (item) =>
          item.debtorName.toLowerCase().includes(q) || (item.debtorPhone ?? '').toLowerCase().includes(q),
      )
    : items;

  const selectedSummary = items.find((item) => item.id === selectedDebtId) ?? null;

  const { data: detail } = useQuery({
    queryKey: ['debts', 'detail', selectedDebtId],
    queryFn: () => debtsApi.getById(selectedDebtId as string),
    enabled: !!selectedDebtId,
  });

  const panelDebt: DebtPanelData | null = detail ?? selectedSummary;

  const repayMutation = useMutation({
    mutationFn: (body: { amount: number; method: 'CASH' | 'CARD'; note: string }) =>
      debtsApi.repay(selectedDebtId as string, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success("To'lov qabul qilindi");
      // Force the panel to remount with a clean amount/note — the same debt
      // usually stays selected (a partial repayment doesn't close it).
      setRepayVersion((v) => v + 1);
    },
    onError: (err: Error) => toast.error(err.message || "Qarz to'lovini saqlab bo'lmadi"),
  });

  // Reprint the original order's bill — handy when collecting debt and the
  // customer wants a copy of what they're paying for. Same printer queue as
  // a normal bill print.
  const reprintMutation = useMutation({
    mutationFn: (orderId: string) => ordersApi.reprintBill(orderId, "Nasiya to'lov vaqtida"),
    onSuccess: () => toast.success('Chek printerga yuborildi'),
    onError: (err: Error) => toast.error(err.message || "Chek chiqarib bo'lmadi"),
  });

  return (
    <Screen
      title="Qarzlar"
      status={
        <>
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value || '__all__'}
              size="sm"
              variant={status === filter.value ? 'default' : 'secondary'}
              onClick={() => setStatus(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </>
      }
      panel={
        selectedDebtId ? (
          panelDebt ? (
            <DebtPanel
              key={`${selectedDebtId}-${repayVersion}`}
              debt={panelDebt}
              submitting={repayMutation.isPending}
              error={repayMutation.error instanceof Error ? repayMutation.error.message : null}
              reprinting={reprintMutation.isPending}
              onRepay={(body) => repayMutation.mutate(body)}
              onReprint={(orderId) => reprintMutation.mutate(orderId)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              Yuklanmoqda…
            </div>
          )
        ) : (
          <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
            {items.length > 0 ? 'Tafsilotlar uchun qarzni tanlang' : "Qarzlar yo'q"}
          </div>
        )
      }
    >
      <DebtList
        items={filteredItems}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedDebtId}
        onSelect={(item) => setSelectedDebtId(item.id)}
        isLoading={isLoading}
      />
    </Screen>
  );
}

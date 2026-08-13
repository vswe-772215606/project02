import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { stockApi, type StockItem } from '@/api/stock';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { StockList } from '@/components/stock/StockList';
import { StockPanel, type StockVerb } from '@/components/stock/StockPanel';

type Filter = 'uncounted' | 'all';

const isUncounted = (item: StockItem) => item.stockCount === null;

/**
 * Ombor — the morning count.
 *
 * The routine is several dishes in one pass, so the panel stays open and
 * "Saqla va keyingisi" moves to the next uncounted dish. Previously each dish
 * cost a full open-sheet → type → save → close cycle with a round-trip
 * between, which made an eight-dish morning roughly forty taps.
 */
export function OmborPage() {
  usePageTitle('Ombor');
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('uncounted');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verb, setVerb] = useState<StockVerb>('count');

  const { data: items = [] } = useQuery({
    queryKey: ['stock'],
    queryFn: stockApi.list,
  });

  const uncounted = useMemo(() => items.filter(isUncounted), [items]);
  const visible = filter === 'uncounted' && uncounted.length > 0 ? uncounted : items;

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const { data: entries = [] } = useQuery({
    queryKey: ['stock', selectedId, 'entries'],
    queryFn: () => stockApi.entries(selectedId as string),
    enabled: !!selectedId,
  });

  /** The next dish still waiting for today's count, excluding the current one. */
  const nextUncounted = useMemo(
    () => uncounted.find((item) => item.id !== selectedId) ?? null,
    [uncounted, selectedId],
  );

  const done = (message: string, advance: boolean) => {
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
    toast.success(message);
    if (advance) setSelectedId(nextUncounted?.id ?? null);
  };

  const countMutation = useMutation({
    mutationFn: (countedQty: number) => stockApi.count(selectedId as string, { countedQty }),
    onSuccess: () => done('Sanoq saqlandi', true),
    onError: (err: Error) => toast.error(err.message),
  });

  const restockMutation = useMutation({
    mutationFn: (body: { qty: number; paidUzs: number | null; setCostFromPaid: boolean }) =>
      stockApi.restock(selectedId as string, body),
    onSuccess: () => done('Kirim saqlandi', false),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Screen
      title="Ombor"
      status={
        <>
          <Button
            size="sm"
            variant={filter === 'uncounted' ? 'default' : 'secondary'}
            onClick={() => setFilter('uncounted')}
          >
            Sanoqsiz {uncounted.length}
          </Button>
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'secondary'}
            onClick={() => setFilter('all')}
          >
            Hammasi {items.length}
          </Button>
        </>
      }
      panel={
        selected ? (
          <StockPanel
            key={selected.id}
            item={selected}
            entries={entries}
            verb={verb}
            onVerbChange={setVerb}
            submitting={countMutation.isPending || restockMutation.isPending}
            hasNextUncounted={!!nextUncounted}
            onSave={(payload) => {
              if (payload.verb === 'count') countMutation.mutate(payload.countedQty);
              else
                restockMutation.mutate({
                  qty: payload.qty,
                  paidUzs: payload.paidUzs,
                  setCostFromPaid: payload.setCostFromPaid,
                });
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
            {uncounted.length > 0
              ? `${uncounted.length} ta taom sanoqsiz — birini tanlang`
              : 'Sanash uchun taomni tanlang'}
          </div>
        )
      }
    >
      <StockList items={visible} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />
    </Screen>
  );
}

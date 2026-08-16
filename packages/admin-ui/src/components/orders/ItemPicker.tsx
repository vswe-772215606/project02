import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { ordersApi } from '@/api/orders';
import { menuApi } from '@/api/menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';

function extractAddError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === 'string' ? maybe.code : undefined;
    const message = typeof maybe.message === 'string' ? maybe.message : undefined;
    if (code === 'OUT_OF_STOCK') return message || 'Mahsulot yetarli emas';
    if (code === 'ITEM_UNAVAILABLE') return message || 'Mahsulot mavjud emas';
    if (message) return message;
  }
  return "Qo'shib bo'lmadi";
}

type Tab = 'items' | 'combos';

/**
 * Replaces the line list in the panel's middle while adding — the same
 * "swap, don't grow" idea OrderTicket uses for its keypad, so a long menu
 * never pushes the totals or the status action off a 768px screen.
 */
export function ItemPicker({ orderId, onAdded }: { orderId: string; onAdded: () => void }) {
  const [tab, setTab] = useState<Tab>('items');
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: menu } = useQuery({ queryKey: ['menu'], queryFn: () => menuApi.getMenu() });
  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos'],
    queryFn: () => menuApi.listCombos(),
  });

  const addItemMutation = useMutation({
    mutationFn: (menuItemId: string) => ordersApi.addItem(orderId, { menuItemId, quantity: 1 }),
    onMutate: (menuItemId) => setPendingId(menuItemId),
    onSettled: () => setPendingId(null),
    onSuccess: onAdded,
    onError: (error) => toast.error(extractAddError(error)),
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onMutate: (comboId) => setPendingId(comboId),
    onSettled: () => setPendingId(null),
    onSuccess: onAdded,
    onError: (error) => toast.error(extractAddError(error)),
  });

  const busy = addItemMutation.isPending || addComboMutation.isPending;

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menu?.categories ?? [])
      .flatMap((category) =>
        (category.items ?? []).map((item) => ({ item, categoryName: category.name })),
      )
      .filter(({ item }) => item.kind !== 'SERVICE' && (!q || item.name.toLowerCase().includes(q)));
  }, [menu, search]);

  const filteredCombos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combos.filter((combo) => combo.isActive && (!q || combo.name.toLowerCase().includes(q)));
  }, [combos, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-seam">
      <Seam direction="row" columns="1fr 1fr" className="shrink-0">
        <Button variant={tab === 'items' ? 'default' : 'secondary'} onClick={() => setTab('items')}>
          Mahsulotlar
        </Button>
        <Button variant={tab === 'combos' ? 'default' : 'secondary'} onClick={() => setTab('combos')}>
          Kombolar
        </Button>
      </Seam>

      <Input
        type="text"
        placeholder="Qidirish..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="shrink-0"
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          {tab === 'items' ? (
            items.length === 0 ? (
              <div className="bg-field px-pad py-6 text-center text-[14px] text-muted-foreground">
                Mahsulot topilmadi
              </div>
            ) : (
              items.map(({ item, categoryName }) => {
                const unavailable = item.effectivelyAvailable === false || !item.isAvailable;
                const disabled = busy || unavailable;
                return (
                  <Row
                    key={item.id}
                    columns="1fr 110px"
                    inert={disabled}
                    onClick={disabled ? undefined : () => addItemMutation.mutate(item.id)}
                  >
                    <span className="min-w-0 truncate">
                      {item.name}
                      <RowSub>{unavailable ? 'Mavjud emas' : categoryName}</RowSub>
                    </span>
                    <RowMoney>
                      {pendingId === item.id ? (
                        <Loader2 className="ml-auto animate-spin" />
                      ) : (
                        formatMoney(item.price)
                      )}
                    </RowMoney>
                  </Row>
                );
              })
            )
          ) : filteredCombos.length === 0 ? (
            <div className="bg-field px-pad py-6 text-center text-[14px] text-muted-foreground">
              Kombo topilmadi
            </div>
          ) : (
            filteredCombos.map((combo) => (
              <Row
                key={combo.id}
                columns="1fr 110px"
                inert={busy}
                onClick={busy ? undefined : () => addComboMutation.mutate(combo.id)}
              >
                <span className="min-w-0 truncate">
                  {combo.name}
                  <RowSub>
                    {combo.components
                      .map((component) => component.menuItem?.name)
                      .filter(Boolean)
                      .join(', ') || `${combo.components.length} ta mahsulot`}
                  </RowSub>
                </span>
                <RowMoney>
                  {pendingId === combo.id ? (
                    <Loader2 className="ml-auto animate-spin" />
                  ) : (
                    formatMoney(combo.price ?? 0)
                  )}
                </RowMoney>
              </Row>
            ))
          )}
        </Seam>
      </div>
    </div>
  );
}

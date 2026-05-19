import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { menuApi, type MenuItem, type Combo } from '@/api/menu';
import { ordersApi, type Order, type OrderLine } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  orderId: string;
  disabled?: boolean;
};

export function MenuPanel({ orderId, disabled = false }: Props) {
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);

  const {
    data: menuData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['menu'],
    queryFn: menuApi.list,
    staleTime: 30_000,
  });

  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos'],
    queryFn: menuApi.combos,
    staleTime: 30_000,
  });

  const categories = useMemo(() => menuData?.categories ?? [], [menuData]);
  const activeCombos = useMemo(() => combos.filter((c) => c.isActive), [combos]);
  const currentCatId = activeCatId ?? categories[0]?.id ?? null;
  const currentCat = categories.find((c) => c.id === currentCatId);

  // Subscribe to the order so the cart-qty pill on each ItemCard re-renders
  // when the cache is patched by add/cancel/qty mutations. No queryFn here —
  // we piggy-back on the OrderDetailPage's query.
  const { data: order } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.getById(orderId),
    enabled: !!orderId,
  });
  const cartQtyById = useMemo(() => {
    const m = new Map<string, number>();
    if (!order) return m;
    for (const l of order.lines) {
      if (l.isCanceled || !l.menuItemId) continue;
      m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.quantity);
    }
    return m;
  }, [order]);

  // Optimistic add: patch the cached order immediately so the cart on the
  // right updates with zero perceived latency. The socket order:updated
  // event triggered by the server's response reconciles afterwards.
  const addItemMutation = useMutation({
    mutationFn: (item: MenuItem) =>
      ordersApi.addItem(orderId, { menuItemId: item.id, quantity: 1 }),

    onMutate: async (item: MenuItem) => {
      await qc.cancelQueries({ queryKey: ['orders', orderId] });
      const prev = qc.getQueryData<Order>(['orders', orderId]);
      if (prev) {
        const existing = prev.lines.find(
          (l) => !l.isCanceled && l.menuItemId === item.id,
        );
        const newLines = existing
          ? prev.lines.map((l) =>
              l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l,
            )
          : [
              ...prev.lines,
              {
                id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                orderId,
                menuItemId: item.id,
                comboGroupId: null,
                comboNameSnapshot: null,
                nameSnapshot: item.name,
                price: item.price,
                quantity: 1,
                notes: null,
                isCanceled: false,
                createdAt: new Date().toISOString(),
              } satisfies OrderLine,
            ];
        qc.setQueryData<Order>(['orders', orderId], { ...prev, lines: newLines });
      }
      return { prev };
    },

    onError: (err: Error & { code?: string }, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['orders', orderId], ctx.prev);
      const code = err.code ?? err.message;
      if (code === 'OUT_OF_STOCK') {
        showToast('Bu mahsulot tugagan', 'error');
        void qc.invalidateQueries({ queryKey: ['menu'] });
      } else if (code === 'ITEM_UNAVAILABLE') {
        showToast('Bu mahsulot mavjud emas', 'error');
        void qc.invalidateQueries({ queryKey: ['menu'] });
      } else {
        showToast(err.message || "Qo'shib bo'lmadi", 'error');
      }
    },
    // No onSettled invalidate — server emits order:updated over socket,
    // which our useSocket hook listens to and refetches accordingly.
    // Doing it here too would cause a redundant double-fetch.
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onError: (err: Error) => showToast(err.message || "Set qo'shib bo'lmadi", 'error'),
  });

  const handleItemClick = (item: MenuItem) => {
    if (disabled || !item.effectivelyAvailable) return;
    addItemMutation.mutate(item);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-center text-sm text-destructive">
        <span className="font-semibold">Menyu yuklab bo&apos;lmadi</span>
        <span className="text-muted-foreground">Server bilan aloqani tekshiring</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Category tabs — big touch targets for rush moments */}
      <div className="border-b shrink-0">
        <div className="flex overflow-x-auto">
          {activeCombos.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCombos(true)}
              className={cn(
                'px-5 py-4 text-base font-semibold whitespace-nowrap border-b-2 transition-colors min-h-[52px]',
                showCombos
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              Set menyu
            </button>
          )}
          {categories.map((cat) => {
            const active = !showCombos && currentCatId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCatId(cat.id);
                  setShowCombos(false);
                }}
                className={cn(
                  'px-5 py-4 text-base font-semibold whitespace-nowrap border-b-2 transition-colors min-h-[52px]',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-3">
        {showCombos ? (
          <div className="flex flex-col gap-3">
            {activeCombos.map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                disabled={disabled || addComboMutation.isPending}
                onPress={() => !disabled && addComboMutation.mutate(combo.id)}
              />
            ))}
            {activeCombos.length === 0 && (
              <div className="text-center text-base text-muted-foreground py-12">Set menyu yo&apos;q</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {(currentCat?.items ?? []).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                disabled={disabled}
                inCartQty={cartQtyById.get(item.id) ?? 0}
                onPress={() => handleItemClick(item)}
              />
            ))}
            {(currentCat?.items ?? []).length === 0 && (
              <div className="col-span-full text-center text-base text-muted-foreground py-12">
                Bu kategoriyada mahsulot yo&apos;q
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  disabled,
  inCartQty,
  onPress,
}: {
  item: MenuItem;
  disabled: boolean;
  inCartQty: number;
  onPress: () => void;
}) {
  const available = item.effectivelyAvailable;
  const isDisabled = disabled || !available;
  const inCart = inCartQty > 0;

  return (
    <Card
      className={cn(
        'relative p-4 flex flex-col justify-between gap-2 cursor-pointer min-h-[120px] transition-all',
        'active:scale-[0.98] active:bg-primary/5 select-none',
        isDisabled
          ? 'opacity-50 cursor-not-allowed bg-muted/50'
          : inCart
            ? 'border-primary/70 bg-primary/5 hover:border-primary hover:shadow-sm'
            : 'hover:border-primary hover:shadow-sm',
      )}
      onClick={isDisabled ? undefined : onPress}
    >
      {inCart && (
        <span className="absolute -top-2 -right-2 min-w-[28px] h-7 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center shadow-sm tabular-nums">
          ×{inCartQty}
        </span>
      )}
      <div className="text-base font-semibold text-foreground line-clamp-2 leading-tight">{item.name}</div>
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-primary tabular-nums">{formatMoney(item.price)}</div>
        {!available && (
          <Badge variant="secondary" className="text-xs">Yo&apos;q</Badge>
        )}
      </div>
    </Card>
  );
}

function ComboCard({
  combo,
  disabled,
  onPress,
}: {
  combo: Combo;
  disabled: boolean;
  onPress: () => void;
}) {
  const total = combo.components.reduce(
    (sum, c) => sum + c.menuItem.price * c.quantity,
    0,
  );

  return (
    <Card
      className={cn(
        'p-5 cursor-pointer transition-all min-h-[110px] active:scale-[0.99] active:bg-primary/5 select-none',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:shadow-sm',
      )}
      onClick={disabled ? undefined : onPress}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-base font-semibold text-foreground">{combo.name}</div>
        <Badge variant="default">SET</Badge>
      </div>
      <div className="text-sm text-muted-foreground line-clamp-2">
        {combo.components.map((c) => `${c.menuItem.name} × ${c.quantity}`).join('  ·  ')}
      </div>
      <div className="mt-2 text-right text-base font-bold tabular-nums">{formatMoney(total)} so&apos;m</div>
    </Card>
  );
}

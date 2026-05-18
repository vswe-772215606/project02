import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Minus, Loader2 } from 'lucide-react';
import { menuApi, type MenuItem, type Combo } from '@/api/menu';
import { ordersApi } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  orderId: string;
  disabled?: boolean;
};

export function MenuPanel({ orderId, disabled = false }: Props) {
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [itemModal, setItemModal] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [itemNote, setItemNote] = useState('');

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

  const dismissModal = () => {
    setItemModal(null);
    setQuantity(1);
    setItemNote('');
  };

  const addItemMutation = useMutation({
    mutationFn: ({
      menuItemId,
      qty,
      notes,
    }: {
      menuItemId: string;
      qty: number;
      notes: string;
    }) =>
      ordersApi.addItem(orderId, {
        menuItemId,
        quantity: qty,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      dismissModal();
    },
    onError: (err: Error & { code?: string }) => {
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
      dismissModal();
    },
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      showToast("Set qo'shildi", 'success');
    },
    onError: (err: Error) => showToast(err.message || "Set qo'shib bo'lmadi", 'error'),
  });

  const openItem = (item: MenuItem) => {
    if (disabled || !item.effectivelyAvailable) return;
    setItemModal(item);
    setQuantity(1);
    setItemNote('');
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
      {/* Category tabs */}
      <div className="border-b shrink-0">
        <div className="flex overflow-x-auto">
          {activeCombos.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCombos(true)}
              className={cn(
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
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
                  'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
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
          <div className="flex flex-col gap-2">
            {activeCombos.map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                disabled={disabled || addComboMutation.isPending}
                onPress={() => !disabled && addComboMutation.mutate(combo.id)}
              />
            ))}
            {activeCombos.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">Set menyu yo&apos;q</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {(currentCat?.items ?? []).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                disabled={disabled}
                onPress={() => openItem(item)}
              />
            ))}
            {(currentCat?.items ?? []).length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                Bu kategoriyada mahsulot yo&apos;q
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={!!itemModal}
        onOpenChange={(open) => {
          if (!open) dismissModal();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{itemModal?.name ?? ''}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney((itemModal?.price ?? 0) * quantity)} so&apos;m
            </div>

            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-2xl font-bold tabular-nums w-12 text-center">{quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Input
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Eslatma (masalan: piyozsiz)"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={dismissModal}>
              Bekor
            </Button>
            <Button
              onClick={() =>
                itemModal &&
                addItemMutation.mutate({
                  menuItemId: itemModal.id,
                  qty: quantity,
                  notes: itemNote,
                })
              }
              disabled={addItemMutation.isPending}
            >
              {addItemMutation.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemCard({
  item,
  disabled,
  onPress,
}: {
  item: MenuItem;
  disabled: boolean;
  onPress: () => void;
}) {
  const available = item.effectivelyAvailable;
  const isDisabled = disabled || !available;

  return (
    <Card
      className={cn(
        'p-3 flex flex-col justify-between gap-2 cursor-pointer min-h-[100px] transition-colors',
        isDisabled ? 'opacity-50 cursor-not-allowed bg-muted/50' : 'hover:border-primary',
      )}
      onClick={isDisabled ? undefined : onPress}
    >
      <div className="text-sm font-semibold text-foreground line-clamp-2">{item.name}</div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-primary tabular-nums">{formatMoney(item.price)}</div>
        {!available && (
          <Badge variant="secondary" className="text-[10px]">Yo&apos;q</Badge>
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
        'p-4 cursor-pointer transition-colors hover:border-primary',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      onClick={disabled ? undefined : onPress}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-semibold text-foreground">{combo.name}</div>
        <Badge variant="default">SET</Badge>
      </div>
      <div className="text-xs text-muted-foreground line-clamp-2">
        {combo.components.map((c) => `${c.menuItem.name} × ${c.quantity}`).join('  ·  ')}
      </div>
      <div className="mt-2 text-right text-sm font-bold tabular-nums">{formatMoney(total)} so&apos;m</div>
    </Card>
  );
}

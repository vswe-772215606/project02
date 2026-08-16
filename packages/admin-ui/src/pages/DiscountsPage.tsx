import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info } from 'lucide-react';

import { discountsApi, type Discount } from '@/api/discounts';
import { settingsApi } from '@/api/settings';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { Seam } from '@/components/blocks';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { DiscountList } from '@/components/discounts/DiscountList';
import { DiscountPanel } from '@/components/discounts/DiscountPanel';

function extractApiError(err: unknown): string {
  if (err instanceof Error) return err.message || 'Xatolik yuz berdi';
  return 'Xatolik yuz berdi';
}

/**
 * Chegirmalar — the discount presets.
 *
 * The panel is always the editor: there is no separate read view to switch
 * out of, so "select a row" and "edit it" are the same action. Deactivate is
 * the one thing that stays in the action bar's destructive slot, 16px clear
 * of Saqlash.
 */
export function DiscountsPage() {
  usePageTitle('Chegirmalar');
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ discount: Discount; next: boolean } | null>(null);

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts', 'all'],
    queryFn: () => discountsApi.list(true),
  });

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const activeCount = useMemo(() => discounts.filter((d) => d.isActive).length, [discounts]);
  const visibleDiscounts = useMemo(
    () => (showInactive ? discounts : discounts.filter((d) => d.isActive)),
    [discounts, showInactive],
  );

  const selected = creating ? null : discounts.find((d) => d.id === selectedId) ?? null;
  const showPanel = creating || !!selected;

  const createMutation = useMutation({
    mutationFn: (data: { name: string; type: string; value: number }) => discountsApi.create(data),
    onSuccess: (discount) => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setCreating(false);
      setSelectedId(discount.id);
      toast.success("Chegirma qo'shildi");
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Discount> }) => discountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setConfirmTarget(null);
      toast.success('Saqlandi');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setConfirmTarget(null);
      toast.success('Chegirma faolsizlantirildi');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const maxPercent = Number(settings.max_discount_percent || 100);
  const maxAmount = Number(settings.max_discount_amount || 1000000);

  return (
    <>
      <Screen
        title="Chegirmalar"
        status={
          <>
            <Button size="sm" variant={showInactive ? 'secondary' : 'default'} onClick={() => setShowInactive(false)}>
              Faol {activeCount}
            </Button>
            <Button size="sm" variant={showInactive ? 'default' : 'secondary'} onClick={() => setShowInactive(true)}>
              Hammasi {discounts.length}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
              }}
            >
              Yangi chegirma
            </Button>
          </>
        }
        panel={
          showPanel ? (
            <DiscountPanel
              key={selected?.id ?? 'new'}
              discount={selected}
              maxPercent={maxPercent}
              maxAmount={maxAmount}
              isSaving={createMutation.isPending || updateMutation.isPending}
              onSave={(data) => (selected ? updateMutation.mutate({ id: selected.id, data }) : createMutation.mutate(data))}
              onDeactivate={() => selected && setConfirmTarget({ discount: selected, next: false })}
              onReactivate={() => selected && setConfirmTarget({ discount: selected, next: true })}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              Tahrirlash uchun chegirmani tanlang yoki yangisini qo'shing
            </div>
          )
        }
      >
        <Seam className="content-start">
          <div className="flex items-start gap-2.5 bg-field-raised px-pad py-2.5 text-[13px] text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Bu chegirmalar buyurtmani tasdiqlashda hozircha avtomatik qo'llanilmaydi — chegirma summasi
              tasdiqlash oynasida qo'lda, so'm miqdorida kiritiladi. Shu sababli bu yerdagi foiz yoki summa
              chegarasi amalda hali ishlamaydi.
            </span>
          </div>

          <DiscountList
            discounts={visibleDiscounts}
            selectedId={creating ? null : selectedId}
            onSelect={(discount) => {
              setSelectedId(discount.id);
              setCreating(false);
            }}
          />
        </Seam>
      </Screen>

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title={confirmTarget?.next ? 'Qayta faollashtirish' : 'Chegirmani faolsizlantirish'}
        description={
          confirmTarget
            ? confirmTarget.next
              ? `"${confirmTarget.discount.name}" qayta faollashtiriladi.`
              : `"${confirmTarget.discount.name}" endi tanlab bo'lmaydi.`
            : undefined
        }
        confirmLabel={confirmTarget?.next ? 'Faollashtirish' : 'Faolsizlantirish'}
        destructive={!confirmTarget?.next}
        loading={deleteMutation.isPending || updateMutation.isPending}
        onConfirm={() => {
          if (!confirmTarget) return;
          if (confirmTarget.next) {
            updateMutation.mutate({ id: confirmTarget.discount.id, data: { isActive: true } });
          } else {
            deleteMutation.mutate(confirmTarget.discount.id);
          }
        }}
      />
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, UtensilsCrossed, ShoppingBag, ArrowLeft } from 'lucide-react';
import { tablesApi, type Table } from '@/api/tables';
import { ordersApi } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { useConnectionStore } from '@/stores/connection.store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Step = 'type' | 'table';

export function NewOrderPage() {
  const nav = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const offline = useConnectionStore((s) => s.status) !== 'online';
  const [step, setStep] = useState<Step>('type');

  const {
    data: tables = [],
    isLoading: loadingTables,
  } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.list,
    enabled: step === 'table',
  });

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      nav(`/orders/${order.id}`, { replace: true });
    },
    onError: (err: Error) => {
      showToast(err.message || "Buyurtma yaratib bo'lmadi", 'error');
    },
  });

  const handleTakeaway = () => {
    if (offline) return;
    createMutation.mutate({ orderType: 'TAKEAWAY' });
  };

  const handleTableSelect = (table: Table) => {
    if (offline || table.activeOrderId) return;
    createMutation.mutate({ orderType: 'DINE_IN', tableId: table.id });
  };

  const activeTables = tables.filter((t) => t.isActive);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {step === 'table' && (
          <Button variant="ghost" size="icon" onClick={() => setStep('type')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h2 className="text-xl font-semibold">
            {step === 'type' ? 'Yangi buyurtma' : 'Stol tanlang'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {step === 'type'
              ? 'Buyurtma turini tanlang'
              : "Buyurtma uchun bo'sh stolni tanlang"}
          </p>
        </div>
      </div>

      {createMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yaratilmoqda...
        </div>
      )}

      {step === 'type' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Card
            className={cn(
              'p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors hover:border-primary',
              (offline || createMutation.isPending) && 'opacity-50 cursor-not-allowed',
            )}
            onClick={offline || createMutation.isPending ? undefined : () => setStep('table')}
          >
            <UtensilsCrossed className="h-12 w-12 text-primary" />
            <div className="text-base font-bold">Zalda</div>
            <div className="text-xs text-muted-foreground">Dine-in</div>
          </Card>

          <Card
            className={cn(
              'p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors hover:border-primary',
              (offline || createMutation.isPending) && 'opacity-50 cursor-not-allowed',
            )}
            onClick={offline || createMutation.isPending ? undefined : handleTakeaway}
          >
            <ShoppingBag className="h-12 w-12 text-primary" />
            <div className="text-base font-bold">Olib ketish</div>
            <div className="text-xs text-muted-foreground">Takeaway</div>
          </Card>
        </div>
      ) : loadingTables ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {activeTables.map((t) => {
            const occupied = !!t.activeOrderId;
            return (
              <Card
                key={t.id}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors',
                  occupied || offline
                    ? 'opacity-50 cursor-not-allowed bg-muted/50'
                    : 'hover:border-primary border-primary/40',
                )}
                onClick={occupied || offline ? undefined : () => handleTableSelect(t)}
              >
                <div className="text-base font-bold">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {occupied ? 'Band' : "Bo'sh"}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

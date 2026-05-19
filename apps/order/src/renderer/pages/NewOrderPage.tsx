import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ShoppingBag } from 'lucide-react';
import { ordersApi } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { useConnectionStore } from '@/stores/connection.store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Post-redesign: dine-in orders start straight from the floor map (HomePage),
// so this route is only the takeaway fast-path. Auto-fires on mount when
// online, and falls back to a one-tap manual button on error/offline.
export function NewOrderPage() {
  const nav = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const offline = useConnectionStore((s) => s.status) !== 'online';

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      nav(`/orders/${order.id}`, { replace: true });
    },
    onError: (err: Error) => {
      showToast(err.message || "Buyurtma yaratib bo'lmadi", 'error');
    },
  });

  useEffect(() => {
    if (offline) return;
    if (createMutation.isIdle && !createMutation.isPending) {
      createMutation.mutate({ orderType: 'TAKEAWAY' });
    }
    // Single-shot on mount — react-query mutation status drives the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  return (
    <div className="max-w-md mx-auto flex flex-col items-center gap-4 py-12">
      <Card className="p-8 flex flex-col items-center gap-4 w-full">
        <ShoppingBag className="h-14 w-14 text-primary" />
        <div className="text-center">
          <div className="text-lg font-bold">Olib ketish</div>
          <p className="text-sm text-muted-foreground mt-1">
            {createMutation.isPending
              ? 'Yaratilmoqda…'
              : createMutation.isError
                ? 'Qaytadan urinib ko\'ring'
                : 'Buyurtma tayyorlanmoqda'}
          </p>
        </div>

        {createMutation.isPending && (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}

        {(createMutation.isError || offline) && (
          <Button
            onClick={() => createMutation.mutate({ orderType: 'TAKEAWAY' })}
            disabled={offline || createMutation.isPending}
            className="h-12 text-base font-bold"
          >
            Yangi olib ketish
          </Button>
        )}

        <Button variant="ghost" onClick={() => nav('/', { replace: true })} className="h-11">
          Stollarga qaytish
        </Button>
      </Card>
    </div>
  );
}

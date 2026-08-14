import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Ban, X } from 'lucide-react';

import { ordersApi, type Order } from '@/api/orders';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function shortOrderNumber(orderNumber: string | null | undefined): string {
  if (!orderNumber) return '—';
  return orderNumber.slice(-6).toUpperCase();
}

/**
 * The one destructive, irreversible action on this screen.
 * A mandatory reason, then confirm.
 */
export function CancelOrderDialog({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!order) throw new Error('Buyurtma tanlanmagan');
      return ordersApi.cancelOrder(order.id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setReason('');
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-owed" strokeWidth={1.75} />
            Buyurtmani bekor qilish
          </DialogTitle>
          <DialogDescription>
            {order ? (
              <>
                #{shortOrderNumber(order.orderNumber)} buyurtma butunlay bekor qilinadi. Bu
                amalni qaytarib bo&apos;lmaydi.
              </>
            ) : (
              <>Buyurtma tanlanmagan.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 bg-owed px-pad py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-owed-foreground" strokeWidth={1.75} />
          <p className="text-[13px] font-medium leading-relaxed text-owed-foreground">
            Diqqat! Qaytarib bo&apos;lmaydigan amal. Sababni aniq yozing — bu audit jurnaliga
            tushadi.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="cancel-reason"
            className="text-[12px] uppercase tracking-wider text-muted-foreground"
          >
            Bekor qilish sababi
          </Label>
          <Textarea
            id="cancel-reason"
            placeholder="Masalan: Mijoz fikridan qaytdi, adashib ochilgan..."
            className="min-h-[100px] resize-none"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Yopish
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending || !order}
            onClick={() => mutation.mutate()}
          >
            <Ban className="h-4 w-4" />
            {mutation.isPending ? 'Bekor qilinmoqda...' : 'Bekor qilishni tasdiqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

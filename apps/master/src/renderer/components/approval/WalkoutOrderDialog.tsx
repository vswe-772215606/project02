import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { ordersApi, type Order } from '@/api/orders';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export function WalkoutOrderDialog({
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setSubmitError(null);
    }
  }, [open, order?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!order) throw new Error('Buyurtma tanlanmagan');
      return ordersApi.markWalkout(order.id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        setSubmitError(typeof message === 'string' ? message : "Saqlab bo'lmadi");
        return;
      }
      setSubmitError("Saqlab bo'lmadi");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buyurtmani to&apos;lovsiz ketgan deb belgilash?</DialogTitle>
          <DialogDescription>
            #{order?.orderNumber ?? ''} buyurtma &quot;To&apos;lovsiz ketdi&quot; holatiga o&apos;tkaziladi.
            U daromad statistikalarida hisobga olinmaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="walkout-reason" className="text-xs uppercase tracking-wider text-muted-foreground">
            Izoh / Sabab
          </Label>
          <Textarea
            id="walkout-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Masalan: Mijoz to'lamay chiqib ketdi..."
            autoFocus
            rows={4}
          />
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Yopish
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setSubmitError(null);
              mutation.mutate();
            }}
            disabled={!reason.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Tasdiqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

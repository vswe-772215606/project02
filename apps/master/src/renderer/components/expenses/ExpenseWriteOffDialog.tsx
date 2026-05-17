import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { expensesApi } from '@/api/expenses';
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
import { MoneyCell } from '@/components/data/MoneyCell';

export type WriteOffTarget = { id: string; reason: string; remainingAmount: string };

export function ExpenseWriteOffDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: WriteOffTarget | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [target?.id]);

  const mutation = useMutation({
    mutationFn: (r: string) => {
      if (!target) throw new Error('Tanlanmagan');
      return expensesApi.writeOff(target.id, r);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      onSuccess?.();
      onClose();
    },
    onError: (err: Error) => setError(err.message || "Yo'qotishni belgilab bo'lmadi"),
  });

  const handleSubmit = () => {
    const r = reason.trim();
    if (r.length < 3) {
      setError('Sababini kamida 3 ta harf bilan yozing');
      return;
    }
    setError(null);
    mutation.mutate(r);
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yo&apos;qotish deb belgilash</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">{target.reason}</span> · Yo&apos;qotiladigan qoldiq:{' '}
                <MoneyCell value={target.remainingAmount} className="font-medium text-foreground" />
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs">
            Yo&apos;qotish deb belgilangach, bu summa haqiqiy chiqimga aylanadi va foyda hisobiga ta&apos;sir qiladi.
          </AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label htmlFor="writeoff-reason">Sabab</Label>
          <Textarea
            id="writeoff-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Masalan: Xodim ishdan ketdi, qaytarib bo'lmadi"
            autoFocus
            rows={4}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Yopish
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Yozilmoqda...' : "Yo'qotish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

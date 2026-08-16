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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyCell } from '@/components/data/MoneyCell';

export type ReturnTarget = { id: string; reason: string; remainingAmount: string };

export function ExpenseReturnDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: ReturnTarget | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(target?.remainingAmount ?? '');
    setNote('');
    setError(null);
  }, [target?.id, target?.remainingAmount]);

  const mutation = useMutation({
    mutationFn: ({ amount: amt, note: n }: { amount: number; note: string }) => {
      if (!target) throw new Error('Tanlanmagan');
      return expensesApi.recordReturn(target.id, { amount: amt, note: n || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      onSuccess?.();
      onClose();
    },
    onError: (err: Error) => setError(err.message || "Qaytimni saqlab bo'lmadi"),
  });

  const handleSubmit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Summa 0 dan katta bo'lishi kerak");
      return;
    }
    setError(null);
    mutation.mutate({ amount: n, note });
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Qaytim qo&apos;shish</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">{target.reason}</span> · Qoldiq:{' '}
                <MoneyCell value={target.remainingAmount} className="font-medium text-foreground" />
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="return-amount">Qaytim summasi (UZS)</Label>
          <Input
            id="return-amount"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={target?.remainingAmount ?? ''}
            autoFocus
            className="tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="return-note">Izoh (ixtiyoriy)</Label>
          <Input
            id="return-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="..."
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
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

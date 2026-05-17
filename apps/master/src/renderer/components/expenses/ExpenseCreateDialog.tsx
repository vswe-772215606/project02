import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { expensesApi } from '@/api/expenses';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

export function ExpenseCreateDialog({
  open,
  onOpenChange,
  date,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [repayable, setRepayable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
      setNote('');
      setRepayable(false);
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => expensesApi.create({
      // categoryId omitted — server defaults to "Operatsion".
      amount: Number(amount),
      reason,
      note: note || undefined,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
      repayable,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message || "Chiqimni saqlab bo'lmadi"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !reason.trim()) {
      setError("Summa va sababni to'ldiring");
      return;
    }
    if (Number(amount) <= 0) {
      setError("Summa 0 dan katta bo'lishi kerak");
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yangi xarajat</DialogTitle>
          <DialogDescription>
            Kunlik chiqimni ro&apos;yxatga olish. &quot;Qaytariladi&quot; belgilangan bo&apos;lsa, keyinroq qaytim qo&apos;shish mumkin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Summa (UZS)</Label>
            <Input
              id="expense-amount"
              type="number"
              min="1"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-reason">Sabab / Maqsad</Label>
            <Input
              id="expense-reason"
              placeholder="Masalan: Aziza opaga avans, Gaz balloni"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-note">Izoh (ixtiyoriy)</Label>
            <Input
              id="expense-note"
              placeholder="..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 cursor-pointer">
            <Checkbox
              id="expense-repayable"
              checked={repayable}
              onCheckedChange={(v) => setRepayable(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Qaytariladi</div>
              <p className="text-xs text-muted-foreground">
                Avans, zalog, vaqtinchalik qarz — keyinroq qaytim yoki yo&apos;qotish belgilanadi.
              </p>
            </div>
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

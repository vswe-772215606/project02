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

export type ReversalTarget = { id: string; reason: string; amount: string };

export function ExpenseReverseDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: ReversalTarget | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setError(null);
  }, [target?.id]);

  const mutation = useMutation({
    mutationFn: (n: string) => {
      if (!target) throw new Error('Tanlanmagan');
      return expensesApi.reverse(target.id, n);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      onSuccess?.();
      onClose();
    },
    onError: (err: Error) => setError(err.message || "Chiqimni bekor qilib bo'lmadi"),
  });

  const handleSubmit = () => {
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      setError('Bekor qilish sababini kamida 3 ta harf bilan yozing');
      return;
    }
    setError(null);
    mutation.mutate(trimmed);
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chiqimni bekor qilish</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <MoneyCell value={target.amount} className="font-medium text-foreground" /> summalik{' '}
                <span className="font-medium text-foreground">{target.reason}</span> chiqimi bekor qilinadi.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs">
            Faqat bugun kiritilgan chiqimni bekor qilish mumkin.
          </AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label htmlFor="reverse-note">Bekor qilish sababi</Label>
          <Textarea
            id="reverse-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Masalan: Adashib kiritildi..."
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
            {mutation.isPending ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

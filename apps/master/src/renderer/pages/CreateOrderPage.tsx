import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Armchair, ShoppingBag } from 'lucide-react';
import { ordersApi } from '@/api/orders';
import { tablesApi } from '@/api/tables';
import { usersApi } from '@/api/users';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type OrderType = 'DINE_IN' | 'TAKEAWAY';

export function CreateOrderPage() {
  usePageTitle('Yangi buyurtma');
  const navigate = useNavigate();

  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableId, setTableId] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => tablesApi.list(),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  // Only tables free of a SENT order are selectable (SENT-only occupancy).
  const freeTables = useMemo(
    () => tables.filter((t) => t.isActive && !t.activeOrderId),
    [tables],
  );
  const waiters = useMemo(
    () => users.filter((u) => u.role === 'WAITER' && u.isActive),
    [users],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      ordersApi.create({
        orderType,
        tableId: orderType === 'DINE_IN' ? tableId : null,
        waiterId,
      }),
    onSuccess: (order) => navigate(`/orders/${order.id}`, { replace: true }),
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'Buyurtma yaratilmadi'),
  });

  const canSubmit = waiterId !== '' && (orderType === 'TAKEAWAY' || tableId !== '');

  const handleSubmit = () => {
    setFormError(null);
    if (orderType === 'DINE_IN' && !tableId) {
      setFormError('Zal buyurtmasi uchun stol tanlanishi shart');
      return;
    }
    if (!waiterId) {
      setFormError('Ofitsiant tanlanishi shart');
      return;
    }
    createMutation.mutate();
  };

  return (
    <PageContent>
      <PageHeader
        title="Yangi buyurtma"
        description="Buyurtma turi, stol va ofitsiantni tanlang"
        actions={
          <Button variant="outline" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4" />
            Orqaga
          </Button>
        }
      />

      <Card className="max-w-xl">
        <CardContent className="pt-6 space-y-6">
          {/* Order type */}
          <div className="space-y-2">
            <Label>Buyurtma turi</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'DINE_IN', label: 'Zalda', icon: Armchair },
                  { value: 'TAKEAWAY', label: 'Olib ketish', icon: ShoppingBag },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = orderType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setOrderType(opt.value);
                      setFormError(null);
                    }}
                    className={cn(
                      'flex items-center justify-center gap-2 h-11 rounded-md border text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-input',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table — DINE_IN only */}
          {orderType === 'DINE_IN' && (
            <div className="space-y-2">
              <Label htmlFor="order-table">Stol</Label>
              <Select
                value={tableId}
                onValueChange={(v) => {
                  setTableId(v);
                  setFormError(null);
                }}
              >
                <SelectTrigger id="order-table">
                  <SelectValue placeholder="Bo'sh stolni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {freeTables.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Bo'sh stol yo'q
                    </div>
                  ) : (
                    freeTables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {t.type === 'ROOM' ? 'Xona' : 'Stol'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Faqat yuborilgan buyurtmasi yo'q stollar ko'rsatiladi.
              </p>
            </div>
          )}

          {/* Waiter */}
          <div className="space-y-2">
            <Label htmlFor="order-waiter">Ofitsiant</Label>
            <Select
              value={waiterId}
              onValueChange={(v) => {
                setWaiterId(v);
                setFormError(null);
              }}
            >
              <SelectTrigger id="order-waiter">
                <SelectValue placeholder="Ofitsiantni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {waiters.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Faol ofitsiant yo'q
                  </div>
                ) : (
                  waiters.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.fullName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Buyurtma tanlangan ofitsiant nomidan ochiladi.
            </p>
          </div>

          {formError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => navigate('/orders')}
              disabled={createMutation.isPending}
            >
              Bekor qilish
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? 'Yaratilmoqda...' : 'Buyurtma yaratish'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContent>
  );
}

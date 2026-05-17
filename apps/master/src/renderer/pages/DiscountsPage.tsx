import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { discountsApi, type Discount } from '../api/discounts';
import { settingsApi } from '../api/settings';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const discountSchema = z.object({
  name: z.string().min(1, 'Nom kiritilishi shart'),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().min(0, "Qiymat noto'g'ri"),
});

type DiscountForm = z.infer<typeof discountSchema>;

export function DiscountsPage() {
  usePageTitle('Chegirmalar');
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editDiscount, setEditDiscount] = useState<Discount | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['discounts', showInactive],
    queryFn: () => discountsApi.list(showInactive),
  });

  const filteredDiscounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discounts;
    return discounts.filter((d) => d.name.toLowerCase().includes(q));
  }, [discounts, search]);

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const createMutation = useMutation({
    mutationFn: (data: DiscountForm) => discountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Discount> }) => discountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setEditDiscount(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discounts'] }),
  });

  const handleToggleActive = (discount: Discount) => {
    if (discount.isActive) {
      setPendingConfirm({
        message: `"${discount.name}" chegirmasini faolsizlantirmoqchimisiz?`,
        onConfirm: () => deleteMutation.mutate(discount.id),
      });
    } else {
      setPendingConfirm({
        message: `"${discount.name}" chegirmasini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: discount.id, data: { isActive: true } }),
      });
    }
  };

  const dialogOpen = isAdding || !!editDiscount;

  return (
    <PageContent>
      <PageHeader
        title="Chegirmalar"
        description="Yopish vaqtida buyurtmaga qo'llaniladigan chegirmalar."
        actions={
          <>
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 h-9 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-xs text-muted-foreground">Faolsizlarni ko'rsatish</span>
            </label>
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              Yangi chegirma
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Nom bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-muted-foreground hover:text-foreground"
            title="Tozalash"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-7 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredDiscounts.length === 0 ? (
        <EmptyState
          icon={Percent}
          title={search.trim() ? 'Hech narsa topilmadi' : "Chegirmalar yo'q"}
          hint={
            search.trim()
              ? 'Boshqa nom bilan qidirib ko\'ring.'
              : "Birinchi chegirmani qo'shing — yopish vaqtida tanlash mumkin."
          }
          action={
            !search.trim() ? (
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4" />
                Yangi chegirma
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredDiscounts.map((discount) => (
            <DiscountCard
              key={discount.id}
              discount={discount}
              onEdit={() => setEditDiscount(discount)}
              onToggleActive={() => handleToggleActive(discount)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditDiscount(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DiscountFormDialog
            key={editDiscount?.id ?? 'new'}
            discount={editDiscount}
            settings={settings}
            onClose={() => {
              setIsAdding(false);
              setEditDiscount(null);
            }}
            onSave={(data) =>
              editDiscount
                ? updateMutation.mutate({ id: editDiscount.id, data })
                : createMutation.mutate(data)
            }
            isPending={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          variant="danger"
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </PageContent>
  );
}

function DiscountCard({
  discount,
  onEdit,
  onToggleActive,
}: {
  discount: Discount;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const isPercent = discount.type === 'PERCENT';
  return (
    <Card className={cn(!discount.isActive && 'border-dashed bg-muted/30')}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'p-2.5 rounded-md border',
              !discount.isActive
                ? 'bg-muted text-muted-foreground border-border'
                : 'bg-primary/10 text-primary border-primary/20',
            )}
          >
            {isPercent ? <Percent className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
          </div>
          {discount.isActive ? (
            <Badge variant="outline" className="bg-success/10 text-success border-success/20 font-medium">
              Faol
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Nofaol</Badge>
          )}
        </div>

        <div className="space-y-1">
          <h3
            className={cn(
              'text-base font-semibold truncate',
              !discount.isActive && 'text-muted-foreground line-through',
            )}
            title={discount.name}
          >
            {discount.name}
          </h3>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums',
              !discount.isActive ? 'text-muted-foreground' : 'text-primary',
            )}
          >
            {isPercent ? `${discount.value}%` : formatMoney(discount.value)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isPercent ? 'Foizli' : 'Belgilangan summa (UZS)'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/60">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Tahrirlash">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleActive}
            title={discount.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
            className={discount.isActive ? 'text-muted-foreground hover:text-destructive' : 'text-success hover:text-success'}
          >
            {discount.isActive ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DiscountFormDialog({
  discount,
  settings,
  onClose,
  onSave,
  isPending,
}: {
  discount: Discount | null;
  settings: Record<string, string>;
  onClose: () => void;
  onSave: (data: DiscountForm) => void;
  isPending: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DiscountForm>({
    resolver: zodResolver(discountSchema),
    defaultValues: discount
      ? { name: discount.name, type: discount.type, value: discount.value }
      : { name: '', type: 'PERCENT', value: 0 },
  });

  const selectedType = watch('type');
  const maxPercent = Number(settings.max_discount_percent || 100);
  const maxAmount = Number(settings.max_discount_amount || 1000000);

  const submit = (data: DiscountForm) => {
    if (data.type === 'PERCENT' && data.value > maxPercent) {
      setFormError(`Chegirma foizi ${maxPercent}% dan oshmasligi kerak`);
      return;
    }
    if (data.type === 'FIXED' && data.value > maxAmount) {
      setFormError(`Chegirma summasi ${formatMoney(maxAmount)} dan oshmasligi kerak`);
      return;
    }
    setFormError(null);
    onSave(data);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{discount ? 'Chegirmani tahrirlash' : 'Yangi chegirma'}</DialogTitle>
        <DialogDescription>
          Yopish vaqtida tanlanadigan chegirma — foiz yoki belgilangan summa.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="discount-name">Chegirma nomi</Label>
          <Input
            id="discount-name"
            autoFocus
            placeholder="Masalan: 10% Bayram chegirmasi"
            {...register('name')}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="discount-type">Turi</Label>
            <Select
              value={selectedType}
              onValueChange={(v) => setValue('type', v as 'PERCENT' | 'FIXED')}
            >
              <SelectTrigger id="discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Foiz (%)</SelectItem>
                <SelectItem value="FIXED">Summa (UZS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount-value">Qiymati</Label>
            <Input
              id="discount-value"
              type="number"
              step="0.01"
              className="tabular-nums"
              {...register('value', { valueAsNumber: true })}
            />
            {errors.value && (
              <p className="text-xs text-destructive">{errors.value.message}</p>
            )}
          </div>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Maksimal chegirma:{' '}
            <b className="tabular-nums">
              {selectedType === 'PERCENT' ? `${maxPercent}%` : formatMoney(maxAmount)}
            </b>
            . Chegirma qiymati ushbu miqdordan oshmasligi kerak.
          </AlertDescription>
        </Alert>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={isPending}>
            Saqlash
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { purchasesApi, type Purchase } from '@/api/purchases';
import { ingredientsApi } from '@/api/ingredients';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateCell } from '@/components/data/DateCell';
import { QuantityCell } from '@/components/data/QuantityCell';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const formSchema = z.object({
  ingredientId: z.string().min(1, 'Mahsulot tanlang'),
  quantityBuyUnit: z.coerce.number().positive('Miqdor 0 dan katta'),
  totalCostUzs: z.coerce.number().positive('Summa 0 dan katta'),
  occurredAt: z.string().min(1),
  supplierNote: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function todayISODate() {
  return new Date().toISOString().slice(0, 16);
}

export function PurchasesPage() {
  usePageTitle('Xaridlar');
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchasesApi.list(),
  });

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', { isActive: true }],
    queryFn: () => ingredientsApi.list({ isActive: true }),
  });

  const ingredientById = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i])),
    [ingredients],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ingredientId: '',
      quantityBuyUnit: 0,
      totalCostUzs: 0,
      occurredAt: todayISODate(),
      supplierNote: '',
    },
  });

  const recordMutation = useMutation({
    mutationFn: purchasesApi.record,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Xarid kiritildi');
      setSheetOpen(false);
      form.reset({
        ingredientId: '',
        quantityBuyUnit: 0,
        totalCostUzs: 0,
        occurredAt: todayISODate(),
        supplierNote: '',
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = form.handleSubmit((values) => {
    recordMutation.mutate({
      ingredientId: values.ingredientId,
      quantityBuyUnit: values.quantityBuyUnit,
      totalCostUzs: values.totalCostUzs,
      occurredAt: new Date(values.occurredAt).toISOString(),
      supplierNote: values.supplierNote || undefined,
    });
  });

  const selectedIngredientId = form.watch('ingredientId');
  const selectedIngredient = selectedIngredientId ? ingredientById.get(selectedIngredientId) : null;

  const columns: DataTableColumn<Purchase>[] = [
    {
      key: 'occurredAt',
      header: 'Sana',
      cell: (row) => <DateCell value={row.occurredAt} />,
    },
    {
      key: 'ingredient',
      header: 'Mahsulot',
      cell: (row) => <span className="font-medium">{row.ingredient.name}</span>,
    },
    {
      key: 'qty',
      header: 'Miqdor',
      align: 'right',
      cell: (row) => <QuantityCell value={row.quantityBuyUnit} unit={row.ingredient.buyUnit} />,
    },
    {
      key: 'total',
      header: 'Summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.totalCostUzs} />,
    },
    {
      key: 'unitCost',
      header: 'Birlik narxi',
      align: 'right',
      cell: (row) => (
        <span className="text-muted-foreground tabular-nums">
          <MoneyCell value={row.unitCostPerRecipeUnit} /> / {row.ingredient.recipeUnit}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Izoh',
      cell: (row) => <span className="text-muted-foreground">{row.supplierNote ?? '—'}</span>,
    },
    {
      key: 'recordedBy',
      header: 'Kim',
      cell: (row) => <span className="text-muted-foreground">{row.recordedByName}</span>,
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Xaridlar"
        description="Mahsulot xaridlari — bu yerdan zaxira to'ldiriladi va o'rtacha tannarx hisoblanadi"
        actions={
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            Xarid kiritish
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={purchases}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={ShoppingCart}
            title="Hozircha xaridlar yo'q"
            hint="Birinchi xaridni kiriting — bu Mahsulot zaxirasini to'ldiradi va Chiqimlar ro'yxatiga ham qo'shiladi."
            action={
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="h-4 w-4" />
                Xarid kiritish
              </Button>
            }
          />
        }
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Xarid kiritish</SheetTitle>
            <SheetDescription>
              Bir hodisada: zaxira ko'tariladi, o'rtacha tannarx yangilanadi, "Mahsulot xaridi" chiqimi yoziladi.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-ingredient">Mahsulot</Label>
              <Select
                value={form.watch('ingredientId')}
                onValueChange={(value) => form.setValue('ingredientId', value, { shouldValidate: true })}
              >
                <SelectTrigger id="purchase-ingredient">
                  <SelectValue placeholder="Mahsulot tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {(ingredients ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.buyUnit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.ingredientId && (
                <p className="text-xs text-destructive">{form.formState.errors.ingredientId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="purchase-qty">
                  Miqdor {selectedIngredient && <span className="text-muted-foreground">({selectedIngredient.buyUnit})</span>}
                </Label>
                <Input
                  id="purchase-qty"
                  type="number"
                  step="0.001"
                  {...form.register('quantityBuyUnit')}
                />
                {form.formState.errors.quantityBuyUnit && (
                  <p className="text-xs text-destructive">{form.formState.errors.quantityBuyUnit.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-total">Summa (UZS)</Label>
                <Input
                  id="purchase-total"
                  type="number"
                  step="100"
                  {...form.register('totalCostUzs')}
                />
                {form.formState.errors.totalCostUzs && (
                  <p className="text-xs text-destructive">{form.formState.errors.totalCostUzs.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-when">Vaqti</Label>
              <Input
                id="purchase-when"
                type="datetime-local"
                {...form.register('occurredAt')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-note">Izoh (ixtiyoriy)</Label>
              <Input id="purchase-note" placeholder="Sotuvchi, partiya raqami va h.k." {...form.register('supplierNote')} />
            </div>

            {recordMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>{recordMutation.error.message}</AlertDescription>
              </Alert>
            )}

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={recordMutation.isPending}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={recordMutation.isPending}>
                {recordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Saqlash
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}

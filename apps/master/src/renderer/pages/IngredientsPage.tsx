import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Plus, Loader2, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ingredientsApi, type Ingredient } from '@/api/ingredients';
import { menuApi } from '@/api/menu';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { QuantityCell } from '@/components/data/QuantityCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ConfirmDialog } from '../components/ConfirmDialog';

const createSchema = z.object({
  name: z.string().trim().min(1, "Nom kerak"),
  parentMenuItemId: z.string().min(1, "Qaysi taom uchun ekanini tanlang"),
  buyUnit: z.string().trim().min(1, 'Xarid birligi kerak'),
  recipeUnit: z.string().trim().min(1, 'Retsept birligi kerak'),
  conversionFactor: z.coerce.number().positive('0 dan katta bo\'lsin'),
  varianceThreshold: z.coerce.number().nonnegative().default(5),
  isActive: z.boolean().default(true),
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = createSchema.omit({ parentMenuItemId: true });
type EditValues = z.infer<typeof editSchema>;
type FormValues = CreateValues;

export function IngredientsPage() {
  usePageTitle('Mahsulotlar');
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Ingredient | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => ingredientsApi.list(),
  });

  const filteredData = useMemo(() => {
    if (!data) return data;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => {
      if (row.name.toLowerCase().includes(q)) return true;
      const parent = row.parentMenuItem?.name ?? '';
      return parent.toLowerCase().includes(q);
    });
  }, [data, search]);

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu', 'items'],
    queryFn: () => menuApi.listItems(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', parentMenuItemId: '', buyUnit: 'kg', recipeUnit: 'g', conversionFactor: 1000, varianceThreshold: 5, isActive: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: '', parentMenuItemId: '', buyUnit: 'kg', recipeUnit: 'g', conversionFactor: 1000, varianceThreshold: 5, isActive: true });
    setSheetOpen(true);
  };

  const openEdit = (row: Ingredient) => {
    setEditing(row);
    form.reset({
      name: row.name,
      parentMenuItemId: row.parentMenuItemId,
      buyUnit: row.buyUnit,
      recipeUnit: row.recipeUnit,
      conversionFactor: Number(row.conversionFactor),
      varianceThreshold: Number(row.varianceThreshold),
      isActive: row.isActive,
    });
    setSheetOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: ingredientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success("Mahsulot qo'shildi");
      setSheetOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EditValues }) =>
      ingredientsApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Mahsulot yangilandi');
      setSheetOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ingredientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success("Mahsulot o'chirildi");
      setPendingDelete(null);
      setSheetOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setPendingDelete(null);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (editing) {
      const { parentMenuItemId, ...rest } = values;
      void parentMenuItemId;
      updateMutation.mutate({ id: editing.id, body: rest });
    } else {
      createMutation.mutate(values);
    }
  });

  const columns: DataTableColumn<Ingredient>[] = [
    {
      key: 'name',
      header: 'Nom',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isSelfMenuItem && <Badge variant="outline" className="text-[10px]">Menyu mahsuloti</Badge>}
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Taom',
      cell: (row) => (
        <span className="text-muted-foreground">{row.parentMenuItem?.name ?? '—'}</span>
      ),
    },
    {
      key: 'units',
      header: 'Birlik',
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.buyUnit} <span className="text-muted-foreground/60">→</span> {row.recipeUnit}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Qoldiq',
      align: 'right',
      cell: (row) => <QuantityCell value={row.currentStock} unit={row.recipeUnit} />,
    },
    {
      key: 'avgCost',
      header: 'O\'rt. tannarx',
      align: 'right',
      cell: (row) => <MoneyCell value={row.weightedAvgCost} />,
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) =>
        row.isActive ? (
          <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/90">Faol</Badge>
        ) : (
          <Badge variant="outline">Nofaol</Badge>
        ),
    },
  ];

  const submitting = createMutation.isPending || updateMutation.isPending;

  return (
    <PageContent>
      <PageHeader
        title="Mahsulotlar"
        description="Oshxonada ishlatiladigan xom-ashyo va savdoga chiqarilgan mahsulotlar"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Mahsulot qo'shish
          </Button>
        }
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Nom yoki taom bo'yicha qidirish..."
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

      <DataTable
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={openEdit}
        emptyState={
          <EmptyState
            icon={Package}
            title="Hech qanday mahsulot yo'q"
            hint="Birinchi mahsulotni qo'shing — keyin xarid kiritib, retsept tuzasiz."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Mahsulot qo'shish
              </Button>
            }
          />
        }
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? 'Mahsulotni tahrirlash' : "Mahsulot qo'shish"}</SheetTitle>
            <SheetDescription>
              Nom, xarid birligi (kg, l, dona) va retsept birligi (g, ml, dona) bilan o'lchov koeffitsiyenti.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="ingredient-parent">Qaysi taom uchun</Label>
              <select
                id="ingredient-parent"
                disabled={!!editing}
                {...form.register('parentMenuItemId')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Tanlang…</option>
                {menuItems.map((mi) => (
                  <option key={mi.id} value={mi.id}>{mi.name}</option>
                ))}
              </select>
              {form.formState.errors.parentMenuItemId && (
                <p className="text-xs text-destructive">{form.formState.errors.parentMenuItemId.message}</p>
              )}
              {editing && (
                <p className="text-xs text-muted-foreground">Taom o'zgarmaydi — yangi taom uchun yangi mahsulot yarating.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingredient-name">Nom</Label>
              <Input id="ingredient-name" autoFocus {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ingredient-buy-unit">Xarid birligi</Label>
                <Input id="ingredient-buy-unit" placeholder="kg" {...form.register('buyUnit')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ingredient-recipe-unit">Retsept birligi</Label>
                <Input id="ingredient-recipe-unit" placeholder="g" {...form.register('recipeUnit')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingredient-cf">O'lchov koeffitsiyenti</Label>
              <Input
                id="ingredient-cf"
                type="number"
                step="0.001"
                placeholder="1000"
                {...form.register('conversionFactor')}
              />
              <p className="text-xs text-muted-foreground">
                Masalan: 1 kg = 1000 g, 1 l = 1000 ml, 1 dona = 1 dona.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingredient-vt">Farq chegarasi (%)</Label>
              <Input id="ingredient-vt" type="number" step="0.01" {...form.register('varianceThreshold')} />
              <p className="text-xs text-muted-foreground">
                Sanoq vaqtida farq shu foizdan yuqori bo'lsa, sabab kiritish talab qilinadi.
              </p>
            </div>

            {editing && (
              <div className="flex items-start gap-3 rounded-md border border-input bg-muted/30 p-3">
                <Checkbox
                  id="ingredient-active"
                  checked={form.watch('isActive')}
                  onCheckedChange={(checked) => form.setValue('isActive', checked === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="ingredient-active" className="cursor-pointer">Faol</Label>
                  <p className="text-xs text-muted-foreground">
                    Faolsizlantirilgan mahsulot retseptlar uchun tanlanmaydi.
                  </p>
                </div>
              </div>
            )}

            {(createMutation.isError || updateMutation.isError) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {(createMutation.error ?? updateMutation.error)?.message}
                </AlertDescription>
              </Alert>
            )}

            <SheetFooter className="flex-col sm:flex-row gap-2">
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                  onClick={() => setPendingDelete(editing)}
                  disabled={submitting || deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  O'chirish
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={submitting}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Saqlash
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {pendingDelete && (
        <ConfirmDialog
          message={`"${pendingDelete.name}" mahsulotini butunlay o'chirilsinmi? Agar tarixda foydalanilgan bo'lsa, o'chirilmaydi — faolsizlantiring.`}
          variant="danger"
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </PageContent>
  );
}

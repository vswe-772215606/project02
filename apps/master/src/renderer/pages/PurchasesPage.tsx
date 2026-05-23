import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, RotateCcw, Search, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { purchasesApi, type Purchase } from '@/api/purchases';
import { ingredientsApi } from '@/api/ingredients';
import { financeApi } from '@/api/finance';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateCell } from '@/components/data/DateCell';
import { QuantityCell } from '@/components/data/QuantityCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const createSchema = z.object({
  ingredientId: z.string().min(1, 'Mahsulot tanlang'),
  quantityBuyUnit: z.coerce.number().positive('Miqdor 0 dan katta'),
  totalCostUzs: z.coerce.number().positive('Summa 0 dan katta'),
  occurredAt: z.string().min(1),
  supplierNote: z.string().optional(),
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  occurredAt: z.string().min(1),
  supplierNote: z.string().optional(),
});
type EditValues = z.infer<typeof editSchema>;

function todayISODate() {
  return new Date().toISOString().slice(0, 16);
}

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function isSameLocalDay(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

export function PurchasesPage() {
  usePageTitle('Xaridlar');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [pendingReverse, setPendingReverse] = useState<Purchase | null>(null);
  const [reverseNote, setReverseNote] = useState('');
  const [search, setSearch] = useState('');

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchasesApi.list(),
  });

  const filteredPurchases = useMemo(() => {
    if (!purchases) return purchases;
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => {
      if (p.ingredient.name.toLowerCase().includes(q)) return true;
      return (p.supplierNote ?? '').toLowerCase().includes(q);
    });
  }, [purchases, search]);

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', { isActive: true }],
    queryFn: () => ingredientsApi.list({ isActive: true }),
  });

  const ingredientById = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i])),
    [ingredients],
  );

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      ingredientId: '',
      quantityBuyUnit: 0,
      totalCostUzs: 0,
      occurredAt: todayISODate(),
      supplierNote: '',
    },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { occurredAt: todayISODate(), supplierNote: '' },
  });

  useEffect(() => {
    if (editing) {
      editForm.reset({
        occurredAt: toLocalDatetimeInput(editing.occurredAt),
        supplierNote: editing.supplierNote ?? '',
      });
    }
  }, [editing, editForm]);

  const recordMutation = useMutation({
    mutationFn: purchasesApi.record,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Xarid kiritildi');
      setCreateOpen(false);
      createForm.reset({
        ingredientId: '',
        quantityBuyUnit: 0,
        totalCostUzs: 0,
        occurredAt: todayISODate(),
        supplierNote: '',
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EditValues }) =>
      purchasesApi.update(id, {
        supplierNote: body.supplierNote?.trim() ? body.supplierNote.trim() : null,
        occurredAt: new Date(body.occurredAt).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Xarid yangilandi');
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      purchasesApi.reverse(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Xarid bekor qilindi');
      setPendingReverse(null);
      setReverseNote('');
      setEditing(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onCreate = createForm.handleSubmit((values) => {
    recordMutation.mutate({
      ingredientId: values.ingredientId,
      quantityBuyUnit: values.quantityBuyUnit,
      totalCostUzs: values.totalCostUzs,
      occurredAt: new Date(values.occurredAt).toISOString(),
      supplierNote: values.supplierNote || undefined,
    });
  });

  const onSaveEdit = editForm.handleSubmit((values) => {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, body: values });
  });

  const selectedIngredientId = createForm.watch('ingredientId');
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
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className={row.status === 'REVERSED' ? 'text-muted-foreground line-through' : 'font-medium'}>
            {row.ingredient.name}
          </span>
          {row.status === 'REVERSED' && (
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
              Bekor qilingan
            </Badge>
          )}
        </div>
      ),
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

  const canReverseEditing = editing && editing.status === 'ACTIVE' && isSameLocalDay(editing.occurredAt);

  return (
    <PageContent>
      <PageHeader
        title="Xaridlar"
        description="Mahsulot xaridlari — bu yerdan zaxira to'ldiriladi va o'rtacha tannarx hisoblanadi"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Xarid kiritish
          </Button>
        }
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Mahsulot yoki izoh bo'yicha qidirish..."
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
        data={filteredPurchases}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => setEditing(row)}
        emptyState={
          <EmptyState
            icon={ShoppingCart}
            title="Hozircha xaridlar yo'q"
            hint="Birinchi xaridni kiriting — bu Mahsulot zaxirasini to'ldiradi va Chiqimlar ro'yxatiga ham qo'shiladi."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Xarid kiritish
              </Button>
            }
          />
        }
      />

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Xarid kiritish</SheetTitle>
            <SheetDescription>
              Bir hodisada: zaxira ko'tariladi, o'rtacha tannarx yangilanadi, "Mahsulot xaridi" chiqimi yoziladi.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onCreate} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-ingredient">Mahsulot</Label>
              <Select
                value={createForm.watch('ingredientId')}
                onValueChange={(value) => createForm.setValue('ingredientId', value, { shouldValidate: true })}
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
              {createForm.formState.errors.ingredientId && (
                <p className="text-xs text-destructive">{createForm.formState.errors.ingredientId.message}</p>
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
                  {...createForm.register('quantityBuyUnit')}
                />
                {createForm.formState.errors.quantityBuyUnit && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.quantityBuyUnit.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-total">Summa (UZS)</Label>
                <Input
                  id="purchase-total"
                  type="number"
                  step="100"
                  {...createForm.register('totalCostUzs')}
                />
                {createForm.formState.errors.totalCostUzs && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.totalCostUzs.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-when">Vaqti</Label>
              <Input
                id="purchase-when"
                type="datetime-local"
                {...createForm.register('occurredAt')}
              />
              <ClosedDayHint occurredAt={createForm.watch('occurredAt')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-note">Izoh (ixtiyoriy)</Label>
              <Input id="purchase-note" placeholder="Sotuvchi, partiya raqami va h.k." {...createForm.register('supplierNote')} />
            </div>

            {recordMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>{recordMutation.error.message}</AlertDescription>
              </Alert>
            )}

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={recordMutation.isPending}>
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

      {/* Edit sheet */}
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Xaridni tahrirlash</SheetTitle>
            <SheetDescription>
              Faqat sana va izohni o'zgartirish mumkin. Miqdor yoki summani tuzatish uchun
              xaridni bekor qilib, qaytadan kiriting.
            </SheetDescription>
          </SheetHeader>

          {editing && (
            <form onSubmit={onSaveEdit} className="space-y-4 py-4">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mahsulot</span>
                  <span className="font-medium">{editing.ingredient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Miqdor</span>
                  <span className="tabular-nums">{editing.quantityBuyUnit} {editing.ingredient.buyUnit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Summa</span>
                  <span className="tabular-nums"><MoneyCell value={editing.totalCostUzs} /></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kim kiritdi</span>
                  <span>{editing.recordedByName}</span>
                </div>
                {editing.status === 'REVERSED' && (
                  <div className="mt-2 rounded-md bg-red-50 border border-red-200 p-2 space-y-0.5">
                    <div className="text-xs font-semibold text-red-700">Bekor qilingan</div>
                    {editing.reversedByName && (
                      <div className="text-xs text-red-700/80">Kim: {editing.reversedByName}</div>
                    )}
                    {editing.reversalNote && (
                      <div className="text-xs text-red-700/80">Sabab: {editing.reversalNote}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-when">Vaqti</Label>
                <Input
                  id="edit-when"
                  type="datetime-local"
                  disabled={editing.status === 'REVERSED'}
                  {...editForm.register('occurredAt')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-note">Izoh</Label>
                <Input
                  id="edit-note"
                  placeholder="Sotuvchi, partiya raqami va h.k."
                  disabled={editing.status === 'REVERSED'}
                  {...editForm.register('supplierNote')}
                />
              </div>

              {updateMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{updateMutation.error.message}</AlertDescription>
                </Alert>
              )}

              <SheetFooter className="flex-col sm:flex-row gap-2">
                {canReverseEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                    onClick={() => { setReverseNote(''); setPendingReverse(editing); }}
                    disabled={reverseMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Bekor qilish
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>
                  Yopish
                </Button>
                <Button type="submit" disabled={updateMutation.isPending || editing.status === 'REVERSED'}>
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Saqlash
                </Button>
              </SheetFooter>

              {editing.status === 'ACTIVE' && !canReverseEditing && (
                <p className="text-xs text-muted-foreground">
                  Faqat bugungi xaridni bekor qilish mumkin. Eski xaridlar uchun sanoq orqali tuzating.
                </p>
              )}
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* Reverse flow — single sheet with note + confirm */}
      <Sheet open={!!pendingReverse} onOpenChange={(open) => { if (!open) { setPendingReverse(null); setReverseNote(''); } }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Xaridni bekor qilish</SheetTitle>
            <SheetDescription>
              {pendingReverse && (
                <>
                  "<span className="font-medium">{pendingReverse.ingredient.name}</span>" xaridi bekor qilinadi.
                  Zaxiradan <span className="tabular-nums">{pendingReverse.quantityBuyUnit} {pendingReverse.ingredient.buyUnit}</span> ayriladi
                  va bog'liq chiqim ham bekor qilinadi.
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="py-4 space-y-1.5">
            <Label htmlFor="reverse-note">Sabab (majburiy)</Label>
            <Textarea
              id="reverse-note"
              autoFocus
              rows={3}
              value={reverseNote}
              onChange={(e) => setReverseNote(e.target.value)}
              placeholder="Masalan: noto'g'ri miqdor kiritilgan, sotuvchi qaytarib oldi va h.k."
              disabled={reverseMutation.isPending}
            />
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setPendingReverse(null); setReverseNote(''); }}
              disabled={reverseMutation.isPending}
            >
              Yo'q
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingReverse) return;
                const note = reverseNote.trim();
                if (!note) {
                  toast.error('Sababni kiriting');
                  return;
                }
                reverseMutation.mutate({ id: pendingReverse.id, note });
              }}
              disabled={reverseMutation.isPending || !reverseNote.trim()}
            >
              {reverseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Ha, bekor qilish
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}

// Tanlangan sana yopilgan kun bo'lsa, foydalanuvchini ogohlantirish.
function ClosedDayHint({ occurredAt }: { occurredAt: string | undefined }) {
  const dateKey = occurredAt ? occurredAt.slice(0, 10) : '';
  const { data } = useQuery({
    queryKey: ['finance', 'daily', dateKey],
    queryFn: () => financeApi.daily(dateKey),
    enabled: Boolean(dateKey),
  });
  if (!data?.closed) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 py-2">
      <AlertDescription className="text-xs">
        Bu kun yopilgan — yozuv &quot;tuzatish&quot; sifatida belgilanadi va alohida bo&apos;limda chiqadi.
      </AlertDescription>
    </Alert>
  );
}

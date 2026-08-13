import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Loader2, Search, X, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { stockApi, type StockItem, type StockEntry } from '@/api/stock';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Verb = 'restock' | 'count';

export function OmborPage() {
  usePageTitle('Ombor');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<{ item: StockItem; verb: Verb } | null>(null);
  const [qty, setQty] = useState('');
  const [paid, setPaid] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['stock'], queryFn: stockApi.list });

  const { data: entries } = useQuery({
    queryKey: ['stock', active?.item.id, 'entries'],
    queryFn: () => stockApi.entries(active!.item.id),
    enabled: !!active,
  });

  const filtered = useMemo(() => {
    if (!data) return data;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => row.name.toLowerCase().includes(q) || row.categoryName.toLowerCase().includes(q));
  }, [data, search]);

  const open = (item: StockItem, verb: Verb) => {
    setActive({ item, verb });
    setQty('');
    setPaid('');
    setUpdateCost(true);
    setNote('');
  };

  const done = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
    toast.success(msg);
    setActive(null);
  };

  const restockMutation = useMutation({
    mutationFn: () => {
      const paidNum = paid.trim() ? Number(paid) : null;
      return stockApi.restock(active!.item.id, {
        qty: Number(qty),
        paidUzs: paidNum,
        setCostFromPaid: paidNum !== null && updateCost,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => done('Kirim saqlandi'),
    onError: (err: Error) => toast.error(err.message),
  });

  const countMutation = useMutation({
    mutationFn: () => stockApi.count(active!.item.id, {
      countedQty: Number(qty),
      note: note.trim() || undefined,
    }),
    onSuccess: () => done('Sanoq saqlandi'),
    onError: (err: Error) => toast.error(err.message),
  });

  const submitting = restockMutation.isPending || countMutation.isPending;
  const qtyNum = Number(qty);
  const qtyValid = qty.trim() !== '' && Number.isInteger(qtyNum) && (active?.verb === 'count' ? qtyNum >= 0 : qtyNum > 0);
  const derivedUnitCost = active?.verb === 'restock' && paid.trim() && qtyValid && qtyNum > 0
    ? Math.round(Number(paid) / qtyNum)
    : null;

  const columns: DataTableColumn<StockItem>[] = [
    {
      key: 'name',
      header: 'Taom',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs">{row.categoryName}</span>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Qoldiq',
      align: 'right',
      cell: (row) =>
        row.stockCount === null ? (
          <Badge variant="outline">Sanoq kiritilmagan</Badge>
        ) : row.stockCount <= 0 ? (
          <Badge variant="default" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">0</Badge>
        ) : (
          <span className="font-medium tabular-nums">{row.stockCount}</span>
        ),
    },
    {
      key: 'cost',
      header: 'Tan narx',
      align: 'right',
      cell: (row) =>
        row.costPrice ? <MoneyCell value={row.costPrice} /> : (
          <span className="text-muted-foreground">kiritilmagan</span>
        ),
    },
    {
      key: 'last',
      header: 'Oxirgi kirim/sanoq',
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.lastEntryAt ? new Date(row.lastEntryAt).toLocaleString('uz-UZ') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(row, 'restock'); }}>
            <Plus className="h-4 w-4" />
            Keldi
          </Button>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(row, 'count'); }}>
            <ClipboardList className="h-4 w-4" />
            Sanoq
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Ombor"
        description="Sanaladigan taomlar qoldig'i — kirim (+ Keldi) va sanoq shu yerda"
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Taom yoki bo'lim bo'yicha qidirish..."
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
        data={filtered}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Package}
            title="Sanaladigan taom yo'q"
            hint="Menyu sahifasida taom yaratishda 'Sanaladigan' turini tanlang."
          />
        }
      />

      <Sheet open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <SheetContent className="sm:max-w-md">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {active.verb === 'restock' ? `Keldi: ${active.item.name}` : `Sanoq: ${active.item.name}`}
                </SheetTitle>
                <SheetDescription>
                  {active.verb === 'restock'
                    ? "Nechta keldi va (ixtiyoriy) qancha to'landi."
                    : 'Hozir omborda nechta borligini yozing — raqam shu qiymatga o\'rnatiladi.'}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="stock-qty">
                    {active.verb === 'restock' ? 'Nechta keldi' : 'Sanalgan miqdor'}
                  </Label>
                  <Input
                    id="stock-qty"
                    autoFocus
                    type="number"
                    step="1"
                    min={active.verb === 'count' ? 0 : 1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hozirgi qoldiq: {active.item.stockCount === null ? 'kiritilmagan' : active.item.stockCount}
                  </p>
                </div>

                {active.verb === 'restock' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="stock-paid">To'landi (so'm, ixtiyoriy)</Label>
                      <Input
                        id="stock-paid"
                        type="number"
                        step="1"
                        min={0}
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                      />
                      {derivedUnitCost !== null && (
                        <p className="text-xs text-muted-foreground">
                          Birlik narxi: {derivedUnitCost.toLocaleString('ru-RU')} so'm
                        </p>
                      )}
                    </div>
                    {paid.trim() !== '' && (
                      <div className="flex items-start gap-3 rounded-md border border-input bg-muted/30 p-3">
                        <Checkbox
                          id="stock-update-cost"
                          checked={updateCost}
                          onCheckedChange={(checked) => setUpdateCost(checked === true)}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="stock-update-cost" className="cursor-pointer">Tan narxni yangilash</Label>
                          <p className="text-xs text-muted-foreground">
                            Taomning tan narxi {derivedUnitCost !== null ? `${derivedUnitCost.toLocaleString('ru-RU')} so'mga` : 'hisoblangan narxga'} o'zgartiriladi.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="stock-note">Izoh (ixtiyoriy)</Label>
                  <Input id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>

                {(restockMutation.isError || countMutation.isError) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {(restockMutation.error ?? countMutation.error)?.message}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setActive(null)} disabled={submitting}>
                    Bekor qilish
                  </Button>
                  <Button
                    type="button"
                    disabled={!qtyValid || submitting}
                    onClick={() => (active.verb === 'restock' ? restockMutation.mutate() : countMutation.mutate())}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Saqlash
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Tarix</p>
                  {(entries ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Hozircha yozuv yo'q.</p>
                  )}
                  {(entries ?? []).slice(0, 15).map((e: StockEntry) => (
                    <div key={e.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(e.occurredAt).toLocaleString('uz-UZ')} · {e.actorName}
                      </span>
                      <span className="tabular-nums">
                        {e.kind === 'RESTOCK'
                          ? `+${e.qty}${e.paidUzs ? ` (${Number(e.paidUzs).toLocaleString('ru-RU')} so'm)` : ''} → ${e.countAfter}`
                          : `sanoq: ${e.countBefore ?? '—'} → ${e.countAfter}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}

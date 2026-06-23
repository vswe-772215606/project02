import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ReceiptText,
  User as UserIcon,
  Armchair,
  ShoppingBag,
  CreditCard,
  Banknote,
  UserPlus,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  ConfirmBody,
  Order,
  PaymentMethod,
  ordersApi,
} from '../api/orders';
import { formatUZS } from '../utils/format';
import { Modal } from './Modal';

interface PaymentLine {
  id: string;
  method: PaymentMethod;
  amount: number;
}

function buildSinglePayment(amount: number): PaymentLine[] {
  return [{ id: '1', method: 'CASH', amount }];
}

function locationLabel(order: Order) {
  return order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan');
}

interface ConfirmModalProps {
  order: Order;
  open: boolean;
  onClose: () => void;
}

export function ConfirmModal({ order, open, onClose }: ConfirmModalProps) {
  const queryClient = useQueryClient();

  // Buyurtmani jonli kuzatamiz: admin pozitsiyani o'chirsa yoki sonini
  // kamaytirsa, qatorlar va yakuniy summa darhol qayta hisoblanadi.
  const { data: liveOrder } = useQuery({
    queryKey: ['orders', order.id],
    queryFn: () => ordersApi.getById(order.id),
    initialData: order,
    enabled: open,
  });
  const o = liveOrder ?? order;

  // Qaysi qator ustida amal ketayotgani (spinner uchun) va qaysi qator
  // o'chirish tasdig'ini kutayotgani.
  const [lineActionId, setLineActionId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Direct discount input in so'm — admin types whatever was agreed at the
  // till. Replaces the old "pick a preset percent/amount" dropdown.
  const [discountInput, setDiscountInput] = useState<string>('');
  const [waiveService, setWaiveService] = useState<boolean>(Boolean(order.serviceChargeWaived));
  const [debtorName, setDebtorName] = useState<string>(order.debt?.debtorName ?? '');
  const [debtorPhone, setDebtorPhone] = useState<string>('');
  const [debtNote, setDebtNote] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Food subtotal = sum of FOOD lines only. SERVICE lines tracked separately.
  const subtotal = useMemo(
    () =>
      o.lines?.reduce(
        (sum, line) =>
          line.isCanceled || line.menuItemKind === 'SERVICE'
            ? sum
            : sum + line.price * line.quantity,
        0,
      ) ?? 0,
    [o.lines],
  );

  const serviceFromLines = useMemo(
    () =>
      o.lines?.reduce(
        (sum, line) =>
          line.isCanceled || line.menuItemKind !== 'SERVICE'
            ? sum
            : sum + line.price * line.quantity,
        0,
      ) ?? 0,
    [o.lines],
  );

  // Live discount preview — what the admin typed, clamped to the food subtotal
  // (admin can't accidentally discount more than the food costs).
  const discountAmountTyped = useMemo(() => {
    const n = Number(discountInput);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.round(n), subtotal);
  }, [discountInput, subtotal]);
  const previewDiscount = discountAmountTyped;

  const previewServiceCharge = waiveService ? 0 : serviceFromLines;
  const previewTotal = subtotal - previewDiscount + previewServiceCharge;

  const [payments, setPayments] = useState<PaymentLine[]>(() => buildSinglePayment(previewTotal));
  const lastSyncedTotal = useRef<number>(previewTotal);

  useEffect(() => {
    if (payments.length !== 1) {
      lastSyncedTotal.current = previewTotal;
      return;
    }
    const first = payments[0];
    if (first && first.amount === lastSyncedTotal.current) {
      setPayments([{ ...first, amount: previewTotal }]);
    }
    lastSyncedTotal.current = previewTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTotal]);

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const isBalanced = Math.abs(totalPaid - previewTotal) < 1;
  const hasDebt = payments.some((payment) => payment.method === 'DEBT' && payment.amount > 0);
  const canSubmit = isBalanced && previewTotal > 0 && (!hasDebt || debtorName.trim().length > 0);

  const confirmMutation = useMutation({
    mutationFn: async (): Promise<Order> => {
      const body: ConfirmBody = {
        discountAmount: discountAmountTyped > 0 ? discountAmountTyped : null,
        waiveServiceCharge: waiveService,
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
        })),
        debt: hasDebt
          ? {
              debtorName: debtorName.trim(),
              debtorPhone: debtorPhone.trim() || undefined,
              note: debtNote.trim() || undefined,
            }
          : undefined,
      };
      return ordersApi.confirm(order.id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (error: unknown) => {
      const message = extractErrorMessage(error);
      setSubmitError(message);
    },
  });

  // Admin pozitsiya sonini bittaga kamaytiradi (updateLineQuantity) yoki uni
  // butunlay o'chiradi (cancelLine). Har amaldan keyin buyurtma qayta yuklanib,
  // oraliq summa va to'lov avtomatik qayta hisoblanadi.
  const decrementMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(order.id, lineId, quantity),
    onMutate: ({ lineId }) => setLineActionId(lineId),
    onSettled: () => setLineActionId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error: unknown) => setSubmitError(extractErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(order.id, lineId),
    onMutate: (lineId) => setLineActionId(lineId),
    onSettled: () => {
      setLineActionId(null);
      setConfirmRemoveId(null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error: unknown) => setSubmitError(extractErrorMessage(error)),
  });

  const lineActionPending = decrementMutation.isPending || removeMutation.isPending;
  const busy = lineActionPending || confirmMutation.isPending;

  const addPayment = () => {
    const remaining = Math.max(0, previewTotal - totalPaid);
    setPayments((current) => [
      ...current,
      { id: Math.random().toString(36).slice(2), method: 'CARD', amount: remaining },
    ]);
  };

  const removePayment = (id: string) => {
    if (payments.length === 1) return;
    setPayments((current) => current.filter((item) => item.id !== id));
  };

  const updatePayment = (id: string, updates: Partial<PaymentLine>) => {
    setPayments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  if (!open) return null;

  return (
    <Modal
      title={`Buyurtmani tasdiqlash: #${order.orderNumber}`}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col gap-6">
        {/* Header strip */}
        <div className="grid grid-cols-4 bg-slate-900 text-white rounded-md overflow-hidden divide-x divide-slate-800 border border-slate-800">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Armchair size={14} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Joy / Stol</span>
            </div>
            <div className="text-base font-black truncate">{locationLabel(o)}</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon size={14} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ofitsiant</span>
            </div>
            <div className="text-sm font-bold text-slate-200 truncate">{o.waiter?.fullName || '—'}</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={14} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Turi</span>
            </div>
            <div className="text-sm font-bold text-slate-200">
              {o.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}
            </div>
          </div>
          <div className="p-4 bg-blue-600/10">
            <div className="flex items-center gap-2 mb-2">
              <ReceiptText size={14} className="text-blue-400" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Pozitsiyalar</span>
            </div>
            <div className="text-lg font-black text-blue-400">{o.itemCount} ta</div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left: lines + bill settings */}
          <div className="col-span-7 space-y-6">
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <ReceiptText size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Buyurtma tarkibi</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase">
                  Oraliq: {formatUZS(subtotal)}
                </span>
              </div>
              <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                {o.lines?.filter((line) => !line.isCanceled).length === 0 && (
                  <div className="p-6 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                    Barcha pozitsiyalar o&apos;chirildi
                  </div>
                )}
                {o.lines?.map((line) => {
                  if (line.isCanceled) return null;
                  const isService = line.menuItemKind === 'SERVICE';
                  const rowBusy = lineActionId === line.id;
                  const confirming = confirmRemoveId === line.id;
                  return (
                    <div
                      key={line.id}
                      className="flex items-start gap-3 p-3 transition-colors hover:bg-slate-50/50"
                    >
                      <div className="w-7 shrink-0 pt-1 text-xs font-black tabular-nums text-slate-400">
                        {line.quantity}×
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-800">{line.nameSnapshot}</div>
                        {isService && (
                          <span className="mt-1 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-600">
                            Xizmat haqi
                          </span>
                        )}
                        {line.notes && (
                          <div className="mt-1 flex items-center gap-1">
                            <Info size={10} className="text-blue-500" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-blue-600">
                              Qayd: {line.notes}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5 text-right text-sm font-black tabular-nums text-slate-700">
                        {formatUZS(line.price * line.quantity)}
                      </div>
                      {!isService && (
                        <div className="flex shrink-0 items-center">
                          {confirming ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                              <span className="text-[10px] font-black uppercase tracking-tight text-red-600">
                                O&apos;chirilsinmi?
                              </span>
                              <button
                                type="button"
                                aria-label="O'chirishni tasdiqlash"
                                disabled={busy}
                                onClick={() => removeMutation.mutate(line.id)}
                                className="inline-flex h-9 min-w-[44px] items-center justify-center rounded-md bg-red-600 px-2 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                              >
                                {rowBusy ? <Loader2 size={14} className="animate-spin" /> : 'Ha'}
                              </button>
                              <button
                                type="button"
                                aria-label="O'chirishni bekor qilish"
                                disabled={busy}
                                onClick={() => setConfirmRemoveId(null)}
                                className="inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border border-slate-200 px-2 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
                              >
                                Yo&apos;q
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label="Sonini kamaytirish"
                                title="Sonini kamaytirish"
                                disabled={busy || line.quantity <= 1}
                                onClick={() =>
                                  decrementMutation.mutate({ lineId: line.id, quantity: line.quantity - 1 })
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {rowBusy && decrementMutation.isPending ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Minus size={14} strokeWidth={2.5} />
                                )}
                              </button>
                              <button
                                type="button"
                                aria-label="Pozitsiyani o'chirish"
                                title="Pozitsiyani o'chirish"
                                disabled={busy}
                                onClick={() => setConfirmRemoveId(line.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-blue-50/30 rounded-md border border-blue-100 p-4">
              <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Info size={14} />
                <span>Hisob sozlamalari</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Chegirma (so&apos;m)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-right tabular-nums outline-none focus:border-blue-500 transition-colors"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  {discountAmountTyped > 0 && Number(discountInput) > subtotal && (
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">
                      Ovqat summasidan oshib ketdi — {formatUZS(subtotal)} ga chegaralandi
                    </p>
                  )}
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-3 w-full cursor-pointer select-none rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 uppercase hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={waiveService}
                      onChange={(e) => setWaiveService(e.target.checked)}
                    />
                    <span>Xizmat haqini bekor qilish</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right: totals + payments */}
          <div className="col-span-5 space-y-6">
            <div className="bg-slate-900 text-white rounded-md p-5 border-b-2 border-blue-600 shadow-inner">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">
                To&apos;lov ma&apos;lumotlari
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Jami</span>
                  <span>{formatUZS(subtotal)}</span>
                </div>
                {previewDiscount > 0 && (
                  <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                    <span className="text-red-500">Chegirma</span>
                    <span className="text-red-500">-{formatUZS(previewDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Xizmat haqi</span>
                  <span>{formatUZS(previewServiceCharge)}</span>
                </div>
                <div className="pt-4 mt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    To&apos;lanadi
                  </span>
                  <span className="text-3xl font-black text-blue-400 tracking-tighter">
                    {formatUZS(previewTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <CreditCard size={14} className="text-slate-400" />
                  <span>To&apos;lov turlari</span>
                </div>
                <button
                  onClick={addPayment}
                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 border border-blue-100 px-2 py-1 rounded transition-colors"
                >
                  <Plus size={12} />
                  QO&apos;SHISH
                </button>
              </div>

              <div className="p-4 space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 relative">
                      {payment.method === 'CASH' && (
                        <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      )}
                      {payment.method === 'CARD' && (
                        <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      )}
                      {payment.method === 'DEBT' && (
                        <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      )}
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-black uppercase outline-none focus:border-blue-500 transition-all"
                        value={payment.method}
                        onChange={(e) =>
                          updatePayment(payment.id, { method: e.target.value as PaymentMethod })
                        }
                      >
                        <option value="CASH">NAQD</option>
                        <option value="CARD">KARTA</option>
                        <option value="DEBT">QARZ</option>
                      </select>
                    </div>
                    <div className="col-span-5">
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-right outline-none focus:border-blue-500 transition-all"
                        value={payment.amount || ''}
                        onChange={(e) =>
                          updatePayment(payment.id, { amount: Number(e.target.value) })
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        disabled={payments.length === 1}
                        onClick={() => removePayment(payment.id)}
                        className="text-slate-300 hover:text-red-500 disabled:opacity-0 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                <div
                  className={`mt-4 rounded-md border p-4 transition-colors ${
                    isBalanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        isBalanced ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      Jami to&apos;lov
                    </span>
                    <span
                      className={`text-lg font-black ${isBalanced ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {formatUZS(totalPaid)} / {formatUZS(previewTotal)} {isBalanced ? '✓' : ''}
                    </span>
                  </div>
                  {!isBalanced && (
                    <div className="mt-2 pt-2 border-t border-red-100 flex justify-between items-center text-[10px] font-black text-red-600 uppercase tracking-tight">
                      <span>FARQ:</span>
                      <span>{formatUZS(previewTotal - totalPaid)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {hasDebt && (
              <div className="bg-amber-50 rounded-md border border-amber-200 p-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2 mb-4 border-b border-amber-200 pb-2">
                  <UserPlus size={14} className="text-amber-600" />
                  <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                    Qarz ma&apos;lumotlari
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">
                      Qarzdor ismi
                    </label>
                    <input
                      className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-amber-500"
                      placeholder="Masalan: Aziz aka"
                      value={debtorName}
                      onChange={(e) => setDebtorName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">
                      Telefon raqami
                    </label>
                    <input
                      className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-amber-500"
                      placeholder="+998 90 123 45 67"
                      value={debtorPhone}
                      onChange={(e) => setDebtorPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">
                      Izoh
                    </label>
                    <textarea
                      className="min-h-[60px] w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-amber-500 resize-none"
                      placeholder="Qo'shimcha ma'lumot..."
                      value={debtNote}
                      onChange={(e) => setDebtNote(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {submitError && (
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-red-700">{submitError}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 pt-6">
          <button
            onClick={onClose}
            className="px-8 py-3 rounded text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            BEKOR QILISH
          </button>
          <button
            disabled={!canSubmit || busy}
            onClick={() => {
              setSubmitError(null);
              confirmMutation.mutate();
            }}
            className={`flex-1 flex items-center justify-center gap-3 rounded py-4 font-black text-white shadow-sm transition-all ${
              canSubmit && !busy
                ? 'bg-blue-600 hover:bg-blue-700 active:translate-y-px'
                : 'bg-slate-300 cursor-not-allowed text-slate-400'
            }`}
          >
            {confirmMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span className="text-sm uppercase tracking-widest">TASDIQLASH</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === 'string' ? maybe.code : undefined;
    const message = typeof maybe.message === 'string' ? maybe.message : undefined;

    if (code === 'PRINT_FAILED' || (message && message.toUpperCase().includes('PRINT'))) {
      return "Chek chop etilmadi, qayta urinib ko'ring";
    }
    if (code === 'PAYMENT_MISMATCH') {
      return "To'lov summasi yakuniy summaga to'g'ri kelmadi";
    }
    if (message) return message;
  }
  return "Buyurtmani tasdiqlab bo'lmadi";
}

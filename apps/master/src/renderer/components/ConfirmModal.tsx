import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Plus,
  Trash2,
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
import { discountsApi } from '../api/discounts';
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

  const [discountId, setDiscountId] = useState<string>('');
  const [waiveService, setWaiveService] = useState<boolean>(Boolean(order.serviceChargeWaived));
  const [debtorName, setDebtorName] = useState<string>(order.debt?.debtorName ?? '');
  const [debtorPhone, setDebtorPhone] = useState<string>('');
  const [debtNote, setDebtNote] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Food subtotal = sum of FOOD lines only. SERVICE lines tracked separately.
  const subtotal = useMemo(
    () =>
      order.lines?.reduce(
        (sum, line) =>
          line.isCanceled || line.menuItemKind === 'SERVICE'
            ? sum
            : sum + line.price * line.quantity,
        0,
      ) ?? 0,
    [order.lines],
  );

  const serviceFromLines = useMemo(
    () =>
      order.lines?.reduce(
        (sum, line) =>
          line.isCanceled || line.menuItemKind !== 'SERVICE'
            ? sum
            : sum + line.price * line.quantity,
        0,
      ) ?? 0,
    [order.lines],
  );

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts'],
    queryFn: () => discountsApi.list(),
    enabled: open,
  });

  const selectedDiscount = useMemo(
    () => discounts.find((item) => item.id === discountId),
    [discountId, discounts],
  );

  const previewDiscount = useMemo(() => {
    if (!selectedDiscount) return 0;
    if (selectedDiscount.type === 'PERCENT') {
      return Math.round((subtotal * selectedDiscount.value) / 100);
    }
    return Math.min(selectedDiscount.value, subtotal);
  }, [selectedDiscount, subtotal]);

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
        discountId: discountId || null,
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
            <div className="text-base font-black truncate">{locationLabel(order)}</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon size={14} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ofitsiant</span>
            </div>
            <div className="text-sm font-bold text-slate-200 truncate">{order.waiter?.fullName || '—'}</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={14} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Turi</span>
            </div>
            <div className="text-sm font-bold text-slate-200">
              {order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}
            </div>
          </div>
          <div className="p-4 bg-blue-600/10">
            <div className="flex items-center gap-2 mb-2">
              <ReceiptText size={14} className="text-blue-400" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Pozitsiyalar</span>
            </div>
            <div className="text-lg font-black text-blue-400">{order.itemCount} ta</div>
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
                {order.lines?.map((line) => (
                  <div
                    key={line.id}
                    className={`grid grid-cols-12 gap-3 p-3 items-start transition-colors ${
                      line.isCanceled ? 'bg-red-50/30' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div
                      className={`col-span-1 text-xs font-black ${
                        line.isCanceled ? 'text-red-300' : 'text-slate-400'
                      }`}
                    >
                      {line.quantity}×
                    </div>
                    <div className="col-span-8">
                      <div
                        className={`text-sm font-bold ${
                          line.isCanceled ? 'text-slate-400 line-through' : 'text-slate-800'
                        }`}
                      >
                        {line.nameSnapshot}
                      </div>
                      {line.notes && (
                        <div className="mt-1 flex items-center gap-1">
                          <Info size={10} className="text-blue-500" />
                          <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">
                            Qayd: {line.notes}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`col-span-3 text-right text-sm font-black ${
                        line.isCanceled ? 'text-slate-300 line-through' : 'text-slate-700'
                      }`}
                    >
                      {formatUZS(line.price * line.quantity)}
                    </div>
                  </div>
                ))}
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
                    Chegirma
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs font-black uppercase outline-none focus:border-blue-500 transition-colors"
                    value={discountId}
                    onChange={(e) => setDiscountId(e.target.value)}
                  >
                    <option value="">Yo&apos;q</option>
                    {discounts
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (
                          {item.type === 'PERCENT' ? `${item.value}%` : formatUZS(item.value)})
                        </option>
                      ))}
                  </select>
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
            disabled={!canSubmit || confirmMutation.isPending}
            onClick={() => {
              setSubmitError(null);
              confirmMutation.mutate();
            }}
            className={`flex-1 flex items-center justify-center gap-3 rounded py-4 font-black text-white shadow-sm transition-all ${
              canSubmit && !confirmMutation.isPending
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

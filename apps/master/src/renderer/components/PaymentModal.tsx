import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Info
} from 'lucide-react';
import { discountsApi } from '../api/discounts';
import { ordersApi, Order } from '../api/orders';
import { settingsApi } from '../api/settings';
import { formatUZS } from '../utils/format';
import { Modal } from './Modal';

interface PaymentLine {
  id: string;
  method: 'CASH' | 'CARD' | 'DEBT';
  amount: number;
}

function buildSinglePayment(amount: number): PaymentLine[] {
  return [{ id: '1', method: 'CASH', amount }];
}

function locationLabel(order: Order) {
  return order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan');
}

export function PaymentModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const needsApproval = order.status === 'BILL_REQUESTED';

  const [discountId, setDiscountId] = useState<string>('');
  const [waiveService, setWaiveService] = useState(Boolean(order.serviceChargeWaived));
  const [payments, setPayments] = useState<PaymentLine[]>(buildSinglePayment(order.totalSnapshot || order.totalAmount));
  const [debtorName, setDebtorName] = useState(order.debt?.debtorName ?? '');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastSyncedTotal = useRef(order.totalSnapshot || order.totalAmount);

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts'],
    queryFn: () => discountsApi.list(),
    enabled: needsApproval,
  });

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    enabled: needsApproval,
  });

  const selectedDiscount = useMemo(
    () => discounts.find((item) => item.id === discountId),
    [discountId, discounts],
  );

  const subtotal = useMemo(
    () => order.lines?.reduce((sum, line) => (line.isCanceled ? sum : sum + line.price * line.quantity), 0) ?? 0,
    [order.lines],
  );

  const previewDiscount = useMemo(() => {
    if (!selectedDiscount) {
      return 0;
    }
    if (selectedDiscount.type === 'PERCENT') {
      return Math.round((subtotal * selectedDiscount.value) / 100);
    }
    return Math.min(selectedDiscount.value, subtotal);
  }, [selectedDiscount, subtotal]);

  const previewServiceCharge = waiveService ? 0 : Number(settings.service_charge_amount || 0);
  const previewTotal = subtotal - previewDiscount + previewServiceCharge;
  const payableTotal = needsApproval ? previewTotal : (order.totalSnapshot || order.totalAmount);

  useEffect(() => {
    if (payments.length !== 1) {
      lastSyncedTotal.current = payableTotal;
      return;
    }

    if (payments[0].amount === lastSyncedTotal.current) {
      setPayments([{ ...payments[0], amount: payableTotal }]);
    }
    lastSyncedTotal.current = payableTotal;
  }, [payableTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const isBalanced = Math.abs(totalPaid - payableTotal) < 1;
  const hasDebt = payments.some((payment) => payment.method === 'DEBT' && payment.amount > 0);
  const canSubmit = isBalanced && payableTotal > 0 && (!hasDebt || debtorName.trim().length > 0);

  const settlementMutation = useMutation({
    mutationFn: async () => {
      let payableOrder = order;

      if (needsApproval) {
        payableOrder = await ordersApi.approve(order.id, {
          discountId: discountId || undefined,
          serviceChargeWaived: waiveService,
        });
      }

      return ordersApi.markPaid(payableOrder.id, {
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (error: any) => setSubmitError(error.message || "Hisobni yakunlab bo'lmadi"),
  });

  const addPayment = () => {
    const remaining = Math.max(0, payableTotal - totalPaid);
    setPayments((current) => [...current, { id: Math.random().toString(), method: 'CARD', amount: remaining }]);
  };

  const removePayment = (id: string) => {
    if (payments.length === 1) {
      return;
    }
    setPayments((current) => current.filter((item) => item.id !== id));
  };

  const updatePayment = (id: string, updates: Partial<PaymentLine>) => {
    setPayments((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  return (
    <Modal
      title={needsApproval ? `To'lovni tasdiqlash: #${order.orderNumber}` : `To'lovni qabul qilish: #${order.orderNumber}`}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col gap-6">
        {/* Strict Grid Header Summary */}
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
            <div className="text-sm font-bold text-slate-200">{order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}</div>
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
          {/* Left: Order Content & Settings */}
          <div className="col-span-7 space-y-6">
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <ReceiptText size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Buyurtma tarkibi</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase">Oraliq: {formatUZS(subtotal)}</span>
              </div>
              <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                {order.lines?.map((line) => (
                  <div key={line.id} className={`grid grid-cols-12 gap-3 p-3 items-start transition-colors ${line.isCanceled ? 'bg-red-50/30' : 'hover:bg-slate-50/50'}`}>
                    <div className={`col-span-1 text-xs font-black ${line.isCanceled ? 'text-red-300' : 'text-slate-400'}`}>
                      {line.quantity}×
                    </div>
                    <div className="col-span-8">
                      <div className={`text-sm font-bold ${line.isCanceled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {line.nameSnapshot}
                      </div>
                      {line.notes && (
                        <div className="mt-1 flex items-center gap-1">
                          <Info size={10} className="text-blue-500" />
                          <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">Qayd: {line.notes}</span>
                        </div>
                      )}
                    </div>
                    <div className={`col-span-3 text-right text-sm font-black ${line.isCanceled ? 'text-slate-300 line-through' : 'text-slate-700'}`}>
                      {formatUZS(line.price * line.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {needsApproval && (
              <div className="bg-blue-50/30 rounded-md border border-blue-100 p-4">
                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info size={14} />
                  <span>Hisob sozlamalari</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chegirma</label>
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs font-black uppercase outline-none focus:border-blue-500 transition-colors"
                      value={discountId}
                      onChange={(e) => setDiscountId(e.target.value)}
                    >
                      <option value="">Chegirma yo'q</option>
                      {discounts.filter((item) => item.isActive).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.type === 'PERCENT' ? `${item.value}%` : formatUZS(item.value)})
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
            )}
          </div>

          {/* Right: Totals & Payments */}
          <div className="col-span-5 space-y-6">
            <div className="bg-slate-900 text-white rounded-md p-5 border-b-2 border-blue-600 shadow-inner">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">To'lov ma'lumotlari</div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Jami</span>
                  <span>{formatUZS(needsApproval ? subtotal : (order.subtotalSnapshot || order.totalAmount))}</span>
                </div>
                {(needsApproval ? previewDiscount : (order.discountAmountSnapshot || 0)) > 0 && (
                  <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                    <span className="text-red-500">Chegirma</span>
                    <span className="text-red-500">-{formatUZS(needsApproval ? previewDiscount : (order.discountAmountSnapshot || 0))}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                  <span className="text-slate-500">Xizmat haqi</span>
                  <span>{formatUZS(needsApproval ? previewServiceCharge : (order.serviceChargeSnapshot || 0))}</span>
                </div>
                <div className="pt-4 mt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To'lanadi</span>
                  <span className="text-3xl font-black text-blue-400 tracking-tighter">
                    {formatUZS(payableTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <CreditCard size={14} className="text-slate-400" />
                  <span>To'lov turlari</span>
                </div>
                <button 
                  onClick={addPayment} 
                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 border border-blue-100 px-2 py-1 rounded transition-colors"
                >
                  <Plus size={12} />
                  QO'SHISH
                </button>
              </div>

              <div className="p-4 space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 relative">
                      {payment.method === 'CASH' && <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
                      {payment.method === 'CARD' && <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
                      {payment.method === 'DEBT' && <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-black uppercase outline-none focus:border-blue-500 transition-all"
                        value={payment.method}
                        onChange={(e) => updatePayment(payment.id, { method: e.target.value as PaymentLine['method'] })}
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
                        onChange={(e) => updatePayment(payment.id, { amount: Number(e.target.value) })}
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

                <div className={`mt-4 rounded-md border p-4 transition-colors ${
                  isBalanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      Kiritilgan jami
                    </span>
                    <span className={`text-lg font-black ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                      {formatUZS(totalPaid)}
                    </span>
                  </div>
                  {!isBalanced && (
                    <div className="mt-2 pt-2 border-t border-red-100 flex justify-between items-center text-[10px] font-black text-red-600 uppercase tracking-tight">
                      <span>FARQ:</span>
                      <span>{formatUZS(payableTotal - totalPaid)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {hasDebt && (
              <div className="bg-amber-50 rounded-md border border-amber-200 p-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2 mb-4 border-b border-amber-200 pb-2">
                  <UserPlus size={14} className="text-amber-600" />
                  <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Qarz ma'lumotlari</h4>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">Qarzdor ismi</label>
                    <input
                      className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-amber-500"
                      placeholder="Masalan: Aziz aka"
                      value={debtorName}
                      onChange={(e) => setDebtorName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">Telefon raqami</label>
                    <input
                      className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-amber-500"
                      placeholder="+998 90 123 45 67"
                      value={debtorPhone}
                      onChange={(e) => setDebtorPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">Izoh</label>
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

        {/* Action Footer */}
        <div className="flex gap-3 border-t border-slate-100 pt-6">
          <button
            onClick={onClose}
            className="px-8 py-3 rounded text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            BEKOR QILISH
          </button>
          <button
            disabled={!canSubmit || settlementMutation.isPending}
            onClick={() => settlementMutation.mutate()}
            className={`flex-1 flex items-center justify-center gap-3 rounded py-4 font-black text-white shadow-sm transition-all ${
              canSubmit && !settlementMutation.isPending
                ? 'bg-blue-600 hover:bg-blue-700 active:translate-y-px'
                : 'bg-slate-300 cursor-not-allowed text-slate-400'
            }`}
          >
            {settlementMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span className="text-sm uppercase tracking-widest">
                  {needsApproval ? 'TASDIQLASH VA HISOBNI YOPISH' : 'TO\'LOVNI QABUL QILISH'}
                </span>
              </>
            )}
          </button>
        </div>
        {submitError && (
          <p className="mt-3 text-xs font-semibold text-red-600 rounded-lg bg-red-50 px-4 py-2">{submitError}</p>
        )}
      </div>
    </Modal>
  );
}

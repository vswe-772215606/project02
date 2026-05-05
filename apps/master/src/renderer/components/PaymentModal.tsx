import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
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
    onError: (error: any) => alert(error.message || 'Hisobni yakunlab bo\'lmadi'),
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
      title={needsApproval ? `Buyurtma #${order.orderNumber} hisobini yakunlash` : `Buyurtma #${order.orderNumber} to'lovi`}
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Joy</div>
            <div className="mt-1 font-semibold text-slate-800">{locationLabel(order)}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Ofitsiant</div>
            <div className="mt-1 font-semibold text-slate-800">{order.waiter?.fullName || '—'}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Buyurtma turi</div>
            <div className="mt-1 font-semibold text-slate-800">{order.orderType === 'DINE_IN' ? 'Ichkarida' : 'Olib ketish'}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Mahsulotlar</div>
            <div className="mt-1 font-semibold text-slate-800">{order.itemCount} ta</div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-bold text-slate-800">Buyurtma tarkibi</div>
              </div>
              <div className="divide-y divide-slate-100">
                {order.lines?.map((line) => (
                  <div key={line.id} className={`flex items-start justify-between px-4 py-3 text-sm ${line.isCanceled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    <div>
                      <div className="font-medium">{line.quantity}x {line.nameSnapshot}</div>
                      {line.notes && <div className="mt-1 text-xs text-slate-500">Qayd: {line.notes}</div>}
                    </div>
                    <div className="font-semibold">{formatUZS(line.price * line.quantity)}</div>
                  </div>
                ))}
              </div>
            </div>

            {needsApproval && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-4 text-sm font-bold text-slate-800">Hisob sozlamalari</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Chegirma</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={waiveService}
                      onChange={(e) => setWaiveService(e.target.checked)}
                    />
                    Xizmat haqini bekor qilish
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-sm font-bold text-slate-800">Hisob yakuni</div>
              <div className="space-y-2 text-sm">
                {needsApproval ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Oraliq jami</span>
                      <span>{formatUZS(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Chegirma</span>
                      <span>-{formatUZS(previewDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Xizmat haqi</span>
                      <span>{formatUZS(previewServiceCharge)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Oraliq jami</span>
                      <span>{formatUZS(order.subtotalSnapshot || order.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Chegirma</span>
                      <span>-{formatUZS(order.discountAmountSnapshot || 0)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Xizmat haqi</span>
                      <span>{formatUZS(order.serviceChargeSnapshot || 0)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-black text-slate-900">
                  <span>To'lanadi</span>
                  <span>{formatUZS(payableTotal)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">To'lov turlari</div>
                <button onClick={addPayment} className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700">
                  <Plus size={16} />
                  Qo'shish
                </button>
              </div>

              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-2">
                    <select
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={payment.method}
                      onChange={(e) => updatePayment(payment.id, { method: e.target.value as PaymentLine['method'] })}
                    >
                      <option value="CASH">NAQD</option>
                      <option value="CARD">KARTA</option>
                      <option value="DEBT">QARZ</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={payment.amount || ''}
                      onChange={(e) => updatePayment(payment.id, { amount: Number(e.target.value) })}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      disabled={payments.length === 1}
                      onClick={() => removePayment(payment.id)}
                      className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <div className={`mt-4 rounded-lg border p-3 ${isBalanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex justify-between text-sm font-semibold">
                  <span className={isBalanced ? 'text-green-700' : 'text-red-700'}>Kiritilgan jami</span>
                  <span className={isBalanced ? 'text-green-700' : 'text-red-700'}>{formatUZS(totalPaid)}</span>
                </div>
                {!isBalanced && (
                  <div className="mt-1 text-xs font-medium text-red-600">
                    Farq: {formatUZS(payableTotal - totalPaid)}
                  </div>
                )}
              </div>
            </div>

            {hasDebt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3 text-sm font-bold text-amber-800">Qarz ma'lumoti</div>
                <div className="space-y-3">
                  <input
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Qarzdor ismi"
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Telefon (ixtiyoriy)"
                    value={debtorPhone}
                    onChange={(e) => setDebtorPhone(e.target.value)}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Izoh (ixtiyoriy)"
                    value={debtNote}
                    onChange={(e) => setDebtNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-slate-100 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Yopish
          </button>
          <button
            disabled={!canSubmit || settlementMutation.isPending}
            onClick={() => settlementMutation.mutate()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 size={18} />
            <span>{needsApproval ? 'TASDIQLASH VA TO\'LOVNI YAKUNLASH' : 'TO\'LOVNI YAKUNLASH'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

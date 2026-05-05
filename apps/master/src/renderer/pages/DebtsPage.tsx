import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, RefreshCw } from 'lucide-react';
import { debtsApi } from '../api/debts';
import { formatDateTimeUZ, formatUZS } from '../utils/format';

export function DebtsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [repayNote, setRepayNote] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['debts', status],
    queryFn: () => debtsApi.list({ status: status || undefined }),
  });

  const { data: detail } = useQuery({
    queryKey: ['debts', 'detail', selectedDebtId],
    queryFn: () => debtsApi.getById(selectedDebtId!),
    enabled: !!selectedDebtId,
  });

  const repayMutation = useMutation({
    mutationFn: () => debtsApi.repay(selectedDebtId!, {
      amount: Number(repayAmount),
      method: repayMethod,
      note: repayNote,
    }),
    onSuccess: () => {
      setRepayAmount('');
      setRepayNote('');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (error: any) => alert(error.message || 'Qarz to\'lovini saqlab bo\'lmadi'),
  });

  const handleRepay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtId || !repayAmount) return;
    repayMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
            <HandCoins size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Qarzlar</h1>
            <p className="text-slate-500">Qarzga berilgan savdo va qaytimlar</p>
          </div>
        </div>
        {isFetching && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      <div className="flex items-center gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Barchasi</option>
          <option value="OPEN">Ochiq</option>
          <option value="PARTIAL">Qisman</option>
          <option value="PAID">To'langan</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Buyurtma</th>
                <th className="px-4 py-3 text-left">Qarzdor</th>
                <th className="px-4 py-3 text-right">Qoldiq</th>
                <th className="px-4 py-3 text-left">Holat</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={4}>Yuklanmoqda...</td></tr>}
              {!isLoading && data?.items.map((item) => (
                <tr key={item.id} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${selectedDebtId === item.id ? 'bg-blue-50' : ''}`} onClick={() => setSelectedDebtId(item.id)}>
                  <td className="px-4 py-3 font-medium">{item.orderNumber}</td>
                  <td className="px-4 py-3">
                    <div>{item.debtorName}</div>
                    {item.debtorPhone && <div className="text-xs text-slate-500">{item.debtorPhone}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatUZS(item.remainingAmount)}</td>
                  <td className="px-4 py-3">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!detail && <div className="text-slate-400">Qarz tafsilotini ko'rish uchun chapdan tanlang.</div>}
          {detail && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{detail.debtorName}</h2>
                <p className="text-slate-500">Buyurtma: {detail.order.orderNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Asl qarz</div>
                  <div className="text-xl font-bold">{formatUZS(detail.originalAmount)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Qolgan qarz</div>
                  <div className="text-xl font-bold">{formatUZS(detail.remainingAmount)}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Qaytimlar</div>
                <div className="space-y-2">
                  {detail.repayments.map((repayment) => (
                    <div key={repayment.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{formatUZS(repayment.amount)}</span>
                        <span>{repayment.method}</span>
                      </div>
                      <div className="text-slate-500">{formatDateTimeUZ(repayment.paidAt)} • {repayment.receivedByName}</div>
                    </div>
                  ))}
                  {detail.repayments.length === 0 && <div className="text-slate-400 text-sm">Hali qaytim yo'q.</div>}
                </div>
              </div>

              {detail.status !== 'PAID' && (
                <form onSubmit={handleRepay} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-700">Qarz to'lovini kiritish</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="number" min="1" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Summa" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
                    <select className="rounded-lg border border-slate-300 px-3 py-2" value={repayMethod} onChange={(e) => setRepayMethod(e.target.value as 'CASH' | 'CARD')}>
                      <option value="CASH">Naqd</option>
                      <option value="CARD">Karta</option>
                    </select>
                  </div>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Izoh (ixtiyoriy)" value={repayNote} onChange={(e) => setRepayNote(e.target.value)} />
                  <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50" disabled={repayMutation.isPending}>
                    {repayMutation.isPending ? 'Saqlanmoqda...' : 'Qaytimni saqlash'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

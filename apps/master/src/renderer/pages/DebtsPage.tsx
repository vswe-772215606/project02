import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, RefreshCw, Users, Plus, Info } from 'lucide-react';
import { debtsApi } from '../api/debts';
import { formatDateTimeUZ, formatUZS } from '../utils/format';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function DebtsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [repayNote, setRepayNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    onError: (error: any) => setErrorMessage(error.message || "Qarz to'lovini saqlab bo'lmadi"),
  });

  const handleRepay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtId || !repayAmount) return;
    repayMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg border-b-4 border-amber-500">
            <HandCoins size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Qarzlar</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Users size={12} />
              Mijozlar qarzlari va qaytimlar nazorati
            </p>
          </div>
        </div>
        {isFetching && (
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs">
            <RefreshCw size={14} className="animate-spin" />
            YANGILANMOQDA...
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter:</div>
        <select className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase outline-none focus:border-slate-800 transition-all" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Barchasi</option>
          <option value="OPEN">Ochiq</option>
          <option value="PARTIAL">Qisman to'langan</option>
          <option value="PAID">Yopilgan</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Debt List */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-6 py-4">Sana / Chek</th>
                  <th className="px-6 py-4">Mijoz</th>
                  <th className="px-6 py-4 text-right">Qoldiq</th>
                  <th className="px-6 py-4">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr><td className="px-6 py-12 text-center text-slate-400 font-bold text-xs" colSpan={4}>YUKLANMOQDA...</td></tr>
                )}
                {!isLoading && data?.items.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`cursor-pointer transition-colors ${selectedDebtId === item.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`} 
                    onClick={() => setSelectedDebtId(item.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-slate-500">{formatDateTimeUZ(item.openedAt)}</div>
                      <div className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-tighter">CHEK #{item.orderNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-slate-800 uppercase">{item.debtorName}</div>
                      {item.debtorPhone && <div className="text-[10px] text-slate-400 font-bold mt-0.5">{item.debtorPhone}</div>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-slate-900">{formatUZS(item.remainingAmount)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                        item.status === 'PAID' ? 'bg-green-100 text-green-700' : 
                        item.status === 'PARTIAL' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status === 'PAID' ? 'YOPILDI' : item.status === 'PARTIAL' ? 'QISMAN' : 'OCHIQ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Detail & Repay */}
        <div className="lg:col-span-5 space-y-6">
          {!detail ? (
            <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400">
              <Info className="mx-auto mb-3 opacity-20" size={48} />
              <p className="text-xs font-black uppercase tracking-widest">Tafsilotlar uchun qarzni tanlang</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="bg-slate-900 text-white rounded-xl p-6 shadow-lg border-b-4 border-amber-500">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Mijoz</div>
                <div className="text-2xl font-black truncate">{detail.debtorName}</div>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                  <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase">Asl qarz</div>
                    <div className="text-sm font-black">{formatUZS(detail.originalAmount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-bold text-slate-500 uppercase">Qoldiq</div>
                    <div className="text-xl font-black text-amber-400">{formatUZS(detail.remainingAmount)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Qaytimlar tarixi</span>
                </div>
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {detail.repayments.map((repayment) => (
                    <div key={repayment.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex justify-between items-center">
                      <div>
                        <div className="text-xs font-black text-slate-900">{formatUZS(repayment.amount)}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">{formatDateTimeUZ(repayment.paidAt)}</div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${repayment.method === 'CASH' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{repayment.method === 'CASH' ? 'NAQD' : 'KARTA'}</span>
                        <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{repayment.receivedByName}</div>
                      </div>
                    </div>
                  ))}
                  {detail.repayments.length === 0 && <div className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Hali to'lov qilinmagan</div>}
                </div>
              </div>

              {detail.status !== 'PAID' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                    <Plus size={14} className="text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To'lov qabul qilish</span>
                  </div>
                  <form onSubmit={handleRepay} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SUMMA</label>
                        <input type="number" min="1" className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" placeholder="0" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">TUR</label>
                        <select className="w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black uppercase outline-none focus:border-slate-800" value={repayMethod} onChange={(e) => setRepayMethod(e.target.value as 'CASH' | 'CARD')}>
                          <option value="CASH">Naqd</option>
                          <option value="CARD">Karta</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">IZOH</label>
                      <input className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold outline-none focus:border-slate-800" placeholder="..." value={repayNote} onChange={(e) => setRepayNote(e.target.value)} />
                    </div>
                    <button type="submit" className="w-full bg-slate-900 text-white rounded-md py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50" disabled={repayMutation.isPending}>
                      {repayMutation.isPending ? 'SAQLANMOQDA...' : 'TO\'LOVNI TASDIQLASH'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    {errorMessage && (
      <ConfirmDialog message={errorMessage} onConfirm={() => setErrorMessage(null)} />
    )}
    </div>
  );
}

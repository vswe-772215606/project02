import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, RefreshCw } from 'lucide-react';
import { expensesApi } from '../api/expenses';
import { formatDateTimeUZ, formatUZS } from '../utils/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ExpensesPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localDateString);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [reversalTarget, setReversalTarget] = useState<null | { id: string; reason: string; amount: string }>(null);
  const [reversalNote, setReversalNote] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expensesApi.getCategories(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['expenses', date],
    queryFn: () => expensesApi.getByDate(date),
  });

  const createMutation = useMutation({
    mutationFn: () => expensesApi.create({
      categoryId,
      amount: Number(amount),
      reason,
      note,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
    }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
    },
    onError: (error: any) => alert(error.message || 'Chiqimni saqlab bo\'lmadi'),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, reversalNote }: { id: string; reversalNote: string }) => expensesApi.reverse(id, reversalNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
      setReversalTarget(null);
      setReversalNote('');
      alert('Chiqim bekor qilindi');
    },
    onError: (error: any) => alert(error.message || 'Chiqimni bekor qilib bo\'lmadi'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount || !reason.trim()) {
      return;
    }
    createMutation.mutate();
  };

  const handleReverseSubmit = () => {
    if (!reversalTarget) {
      return;
    }
    const trimmed = reversalNote.trim();
    if (trimmed.length < 3) {
      alert('Bekor qilish sababini kamida 3 ta harf bilan yozing');
      return;
    }
    reverseMutation.mutate({ id: reversalTarget.id, reversalNote: trimmed });
  };

  React.useEffect(() => {
    if (!categoryId && categories[0]) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <ReceiptText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Chiqimlar</h1>
            <p className="text-slate-500">Kunlik xarajatlarni ro'yxatga olish</p>
          </div>
        </div>
        {isFetching && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="rounded-lg border border-slate-300 px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <input type="number" min="1" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Summa" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Sababi" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
        <input className="md:col-span-5 rounded-lg border border-slate-300 px-3 py-2" placeholder="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Jami chiqim</div>
          <div className="text-2xl font-bold text-slate-800">{formatUZS(data?.totals.net ?? 0)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Bekor qilinganlar</div>
          <div className="text-2xl font-bold text-slate-800">{formatUZS(data?.totals.reversal ?? 0)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Brutto chiqim</div>
          <div className="text-2xl font-bold text-slate-800">{formatUZS(data?.totals.gross ?? 0)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Vaqt</th>
              <th className="px-4 py-3 text-left">Tur</th>
              <th className="px-4 py-3 text-left">Sabab</th>
              <th className="px-4 py-3 text-right">Summa</th>
              <th className="px-4 py-3 text-left">Holat</th>
              <th className="px-4 py-3 text-left">Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={6}>Yuklanmoqda...</td></tr>
            )}
            {!isLoading && data?.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{formatDateTimeUZ(item.occurredAt)}</td>
                <td className="px-4 py-3">{item.categoryName}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{item.reason}</div>
                  {item.note && <div className="text-xs text-slate-500">{item.note}</div>}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatUZS(item.signedAmount)}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">
                  {item.status === 'ACTIVE' ? (
                    <button
                      onClick={() => {
                        setReversalTarget({ id: item.id, reason: item.reason, amount: item.signedAmount });
                        setReversalNote('');
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      Bekor qilish
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">Chiqimni bekor qilish</h2>
            <p className="mt-2 text-sm text-slate-500">
              {formatUZS(reversalTarget.amount)} summalik `{reversalTarget.reason}` chiqimi bekor qilinadi.
            </p>
            <textarea
              className="mt-4 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Bekor qilish sababi"
              value={reversalNote}
              onChange={(e) => setReversalNote(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setReversalTarget(null);
                  setReversalNote('');
                }}
              >
                Yopish
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleReverseSubmit}
                disabled={reverseMutation.isPending}
              >
                {reverseMutation.isPending ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

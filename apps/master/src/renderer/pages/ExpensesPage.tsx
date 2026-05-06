import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, RefreshCw, Calendar } from 'lucide-react';
import { expensesApi } from '../api/expenses';
import { Modal } from '../components/Modal';
import { formatDateTimeUZ, formatUZS } from '../utils/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isToday(date: string | Date) {
  const value = new Date(date);
  const now = new Date();
  return value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
}

export function ExpensesPage() {
  const queryClient = useQueryClient();
  const reversalNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const [date, setDate] = useState(localDateString);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [reversalTarget, setReversalTarget] = useState<null | { id: string; reason: string; amount: string }>(null);
  const [reversalNote, setReversalNote] = useState('');
  const [reversalError, setReversalError] = useState('');
  const [feedback, setFeedback] = useState<null | { type: 'success' | 'error'; message: string }>(null);

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
      setFeedback({ type: 'success', message: 'Chiqim saqlandi' });
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
    },
    onError: (error: any) => setFeedback({ type: 'error', message: error.message || 'Chiqimni saqlab bo\'lmadi' }),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, reversalNote }: { id: string; reversalNote: string }) => expensesApi.reverse(id, reversalNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
      setReversalTarget(null);
      setReversalNote('');
      setReversalError('');
      setFeedback({ type: 'success', message: 'Chiqim bekor qilindi' });
    },
    onError: (error: any) => setReversalError(error.message || 'Chiqimni bekor qilib bo\'lmadi'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount || !reason.trim()) {
      setFeedback({ type: 'error', message: 'Kategoriya, summa va sababni to\'ldiring' });
      return;
    }
    setFeedback(null);
    createMutation.mutate();
  };

  const handleReverseSubmit = () => {
    if (!reversalTarget) {
      return;
    }
    const trimmed = reversalNote.trim();
    if (trimmed.length < 3) {
      setReversalError('Bekor qilish sababini kamida 3 ta harf bilan yozing');
      reversalNoteRef.current?.focus();
      return;
    }
    setReversalError('');
    setFeedback(null);
    reverseMutation.mutate({ id: reversalTarget.id, reversalNote: trimmed });
  };

  React.useEffect(() => {
    if (!categoryId && categories[0]) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  React.useEffect(() => {
    if (reversalTarget) {
      setReversalError('');
    }
  }, [reversalTarget]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg border-b-4 border-red-600">
            <ReceiptText size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Xarajatlar</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={12} />
              Kunlik chiqimlarni ro'yxatga olish
            </p>
          </div>
        </div>
        {isFetching && (
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs">
            <RefreshCw size={14} className="animate-spin" />
            YUKLANMOQDA...
          </div>
        )}
      </div>

      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {/* Form Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Yangi xarajat qo'shish</span>
        </div>
        <form onSubmit={handleCreate} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SANA</label>
              <input type="date" className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">TUR / KATEGORIYA</label>
              <select className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black uppercase outline-none focus:border-slate-800" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SUMMA</label>
              <input type="number" min="1" className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SABAB / MAQSAD</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" placeholder="Masalan: Bozorlik" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-10 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">IZOH (IXTIYORIY)</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold outline-none focus:border-slate-800" placeholder="..." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2 text-xs font-black text-white uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'SAQLANMOQDA...' : 'SAQLASH'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Netto chiqim</div>
          <div className="text-2xl font-black text-slate-900">{formatUZS(data?.totals.net ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm border-l-4 border-red-500">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bekor qilingan</div>
          <div className="text-2xl font-black text-red-600">{formatUZS(data?.totals.reversal ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Brutto chiqim</div>
          <div className="text-2xl font-black text-slate-500">{formatUZS(data?.totals.gross ?? 0)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Vaqt</th>
                <th className="px-6 py-4">Kategoriya</th>
                <th className="px-6 py-4">Sabab</th>
                <th className="px-6 py-4 text-right">Summa</th>
                <th className="px-6 py-4">Holat</th>
                <th className="px-6 py-4 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td className="px-6 py-12 text-center text-slate-400 font-bold text-xs" colSpan={6}>MA'LUMOTLAR YUKLANMOQDA...</td></tr>
              )}
              {!isLoading && data?.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateTimeUZ(item.occurredAt)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black text-slate-600 uppercase">{item.categoryName}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-xs font-black ${item.status === 'REVERSED' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.reason}</div>
                    {item.note && <div className="text-[10px] text-slate-400 font-medium italic">{item.note}</div>}
                  </td>
                  <td className={`px-6 py-4 text-right text-sm font-black ${item.status === 'REVERSAL' ? 'text-red-600' : 'text-slate-900'}`}>
                    {item.status === 'REVERSAL' ? '-' : ''}{formatUZS(item.amount)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                      item.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 
                      item.status === 'REVERSED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.status === 'ACTIVE' ? 'FAOAL' : item.status === 'REVERSED' ? 'BEKOR QILINGAN' : 'QAYTARILISH'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.status === 'ACTIVE' ? (
                      isToday(item.occurredAt) ? (
                        <button
                          onClick={() => {
                            setReversalTarget({ id: item.id, reason: item.reason, amount: item.signedAmount });
                            setReversalNote('');
                            setReversalError('');
                            setFeedback(null);
                          }}
                          className="text-[10px] font-black text-red-600 uppercase tracking-widest hover:underline"
                        >
                          Bekor qilish
                        </button>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                          Faqat bugun
                        </span>
                      )
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reversalTarget && (
        <Modal
          title="Chiqimni bekor qilish"
          onClose={() => {
            setReversalTarget(null);
            setReversalNote('');
            setReversalError('');
          }}
          maxWidth="max-w-md"
          initialFocusRef={reversalNoteRef}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {formatUZS(reversalTarget.amount)} summalik `{reversalTarget.reason}` chiqimi bekor qilinadi.
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Faqat bugun kiritilgan chiqimni bekor qilish mumkin.
            </p>
            <textarea
              ref={reversalNoteRef}
              className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Bekor qilish sababi"
              value={reversalNote}
              onChange={(e) => {
                setReversalNote(e.target.value);
                if (reversalError) {
                  setReversalError('');
                }
              }}
            />
            {reversalError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {reversalError}
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setReversalTarget(null);
                  setReversalNote('');
                  setReversalError('');
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
        </Modal>
      )}
    </div>
  );
}

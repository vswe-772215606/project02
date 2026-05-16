import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, RefreshCw, Calendar, Search, X } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [openRepayableOnly, setOpenRepayableOnly] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [repayable, setRepayable] = useState(false);
  const [returnTarget, setReturnTarget] = useState<null | { id: string; reason: string; remainingAmount: string }>(null);
  const [returnAmount, setReturnAmount] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [writeOffTarget, setWriteOffTarget] = useState<null | { id: string; reason: string; remainingAmount: string }>(null);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writeOffError, setWriteOffError] = useState('');
  const [reversalTarget, setReversalTarget] = useState<null | { id: string; reason: string; amount: string }>(null);
  const [reversalNote, setReversalNote] = useState('');
  const [reversalError, setReversalError] = useState('');
  const [feedback, setFeedback] = useState<null | { type: 'success' | 'error'; message: string }>(null);

  const isSearching = searchQuery.trim().length > 0 || openRepayableOnly;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['expenses', date],
    queryFn: () => expensesApi.getByDate(date),
    enabled: !isSearching,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['expenses', 'search', searchQuery, openRepayableOnly],
    queryFn: () => expensesApi.search({
      q: searchQuery.trim() || undefined,
      openRepayable: openRepayableOnly || undefined,
      limit: 200,
    }),
    enabled: isSearching,
  });

  const createMutation = useMutation({
    mutationFn: () => expensesApi.create({
      // categoryId is now omitted — server defaults to "Operatsion".
      // Admin no longer picks a category in the UI.
      amount: Number(amount),
      reason,
      note,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
      repayable,
    }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      setNote('');
      setRepayable(false);
      setFeedback({ type: 'success', message: 'Chiqim saqlandi' });
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
    },
    onError: (error: any) => setFeedback({ type: 'error', message: error.message || 'Chiqimni saqlab bo\'lmadi' }),
  });

  const recordReturnMutation = useMutation({
    mutationFn: ({ id, amount: amt, note: n }: { id: string; amount: number; note: string }) =>
      expensesApi.recordReturn(id, { amount: amt, note: n || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
      setReturnTarget(null);
      setReturnAmount('');
      setReturnNote('');
      setReturnError('');
      setFeedback({ type: 'success', message: 'Qaytim yozildi' });
    },
    onError: (error: any) => setReturnError(error.message || 'Qaytimni saqlab bo\'lmadi'),
  });

  const writeOffMutation = useMutation({
    mutationFn: ({ id, reason: r }: { id: string; reason: string }) => expensesApi.writeOff(id, r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', date] });
      setWriteOffTarget(null);
      setWriteOffReason('');
      setWriteOffError('');
      setFeedback({ type: 'success', message: 'Yo\'qotish belgilandi' });
    },
    onError: (error: any) => setWriteOffError(error.message || 'Yo\'qotishni belgilab bo\'lmadi'),
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
    if (!amount || !reason.trim()) {
      setFeedback({ type: 'error', message: 'Summa va sababni to\'ldiring' });
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

      {/* Search bar — needed for finding repayable expenses to record returns against */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Sabab yoki izoh bo'yicha qidirish (masalan: Aziza avans)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-700"
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={openRepayableOnly}
            onChange={(e) => setOpenRepayableOnly(e.target.checked)}
            className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
          />
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
            Faqat qaytariladigan, kutilayotganlar
          </span>
        </label>
        {isSearching && (
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Qidiruv natijasi: {searchData?.items.length ?? 0}
          </div>
        )}
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Yangi xarajat qo'shish</span>
        </div>
        <form onSubmit={handleCreate} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SANA</label>
              <input type="date" className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SUMMA (UZS)</label>
              <input type="number" min="1" className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="md:col-span-7 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SABAB / MAQSAD</label>
              <input
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black outline-none focus:border-slate-800"
                placeholder="Masalan: Bolalar uchun futbol maydoni, Aziza opaga avans, Gaz balloni"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-7 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">IZOH (IXTIYORIY)</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold outline-none focus:border-slate-800" placeholder="..." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="md:col-span-3 flex items-center">
              <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-amber-200 bg-amber-50 px-3 py-2 w-full">
                <input
                  type="checkbox"
                  checked={repayable}
                  onChange={(e) => setRepayable(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-700">
                  Qaytariladi
                  <span className="block text-[10px] font-normal text-slate-500">Avans, zalog, vaqtinchalik qarz</span>
                </span>
              </label>
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2 text-xs font-black text-white uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'SAQLANMOQDA...' : 'SAQLASH'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {!isSearching && (
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
      )}

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
              {((isSearching ? searchLoading : isLoading)) && (
                <tr><td className="px-6 py-12 text-center text-slate-400 font-bold text-xs" colSpan={6}>MA'LUMOTLAR YUKLANMOQDA...</td></tr>
              )}
              {isSearching && !searchLoading && (searchData?.items.length ?? 0) === 0 && (
                <tr><td className="px-6 py-12 text-center text-slate-400 font-bold text-xs" colSpan={6}>Hech narsa topilmadi</td></tr>
              )}
              {!(isSearching ? searchLoading : isLoading) && (isSearching ? searchData?.items : data?.items)?.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateTimeUZ(item.occurredAt)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black text-slate-600 uppercase">{item.categoryName}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`text-xs font-black ${item.status === 'REVERSED' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.reason}</div>
                      {item.purchaseId && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"
                          title="Bu chiqim Xaridlar sahifasidagi xarid bilan bog'liq"
                        >
                          Xarid
                        </span>
                      )}
                      {item.repayable && item.repayStatus === 'PENDING' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Kutilmoqda</span>
                      )}
                      {item.repayable && item.repayStatus === 'PARTIAL' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200" title={`Qoldiq: ${formatUZS(item.remainingAmount ?? '0')}`}>Qisman</span>
                      )}
                      {item.repayable && item.repayStatus === 'RETURNED' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Qaytarildi</span>
                      )}
                      {item.repayable && item.repayStatus === 'WRITTEN_OFF' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200" title={item.writtenOffReason ?? ''}>Yo'qotildi</span>
                      )}
                    </div>
                    {item.note && <div className="text-[10px] text-slate-400 font-medium italic">{item.note}</div>}
                    {item.repayable && item.returnedTotal && item.returnedTotal !== '0' && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        Qaytarildi: <span className="font-bold">{formatUZS(item.returnedTotal)}</span>
                        {item.remainingAmount && item.remainingAmount !== '0' && (
                          <span> · Qoldiq: <span className="font-bold">{formatUZS(item.remainingAmount)}</span></span>
                        )}
                      </div>
                    )}
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
                    <div className="flex flex-col items-end gap-1">
                      {item.repayable && (item.repayStatus === 'PENDING' || item.repayStatus === 'PARTIAL') && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setReturnTarget({ id: item.id, reason: item.reason, remainingAmount: item.remainingAmount ?? '0' });
                              setReturnAmount(item.remainingAmount ?? '');
                              setReturnNote('');
                              setReturnError('');
                            }}
                            className="text-[10px] font-black text-emerald-700 uppercase tracking-widest hover:underline"
                          >
                            Qaytim qo'shish
                          </button>
                          <button
                            onClick={() => {
                              setWriteOffTarget({ id: item.id, reason: item.reason, remainingAmount: item.remainingAmount ?? '0' });
                              setWriteOffReason('');
                              setWriteOffError('');
                            }}
                            className="text-[10px] font-black text-red-700 uppercase tracking-widest hover:underline"
                          >
                            Yo'qotish
                          </button>
                        </div>
                      )}
                      {item.status === 'ACTIVE' && !item.repayable ? (
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
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Faqat bugun</span>
                        )
                      ) : null}
                      {item.repayable && item.repayStatus === 'RETURNED' && (
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">To'liq qaytarildi</span>
                      )}
                      {item.repayable && item.repayStatus === 'WRITTEN_OFF' && (
                        <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest">Yo'qotildi</span>
                      )}
                    </div>
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

      {returnTarget && (
        <Modal
          title="Qaytim qo'shish"
          onClose={() => {
            setReturnTarget(null);
            setReturnAmount('');
            setReturnNote('');
            setReturnError('');
          }}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-bold">{returnTarget.reason}</span>
              <span className="block text-xs text-slate-500 mt-0.5">Qoldiq: <span className="font-bold">{formatUZS(returnTarget.remainingAmount)}</span></span>
            </p>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Qaytim summasi</label>
              <input
                type="number"
                min="1"
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"
                placeholder={returnTarget.remainingAmount}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Izoh (ixtiyoriy)</label>
              <input
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="..."
              />
            </div>
            {returnError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{returnError}</div>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => { setReturnTarget(null); setReturnAmount(''); setReturnNote(''); setReturnError(''); }}
              >
                Yopish
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => {
                  const n = Number(returnAmount);
                  if (!Number.isFinite(n) || n <= 0) {
                    setReturnError('Summa 0 dan katta bo\'lishi kerak');
                    return;
                  }
                  recordReturnMutation.mutate({ id: returnTarget.id, amount: n, note: returnNote });
                }}
                disabled={recordReturnMutation.isPending}
              >
                {recordReturnMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {writeOffTarget && (
        <Modal
          title="Yo'qotish deb belgilash"
          onClose={() => { setWriteOffTarget(null); setWriteOffReason(''); setWriteOffError(''); }}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-bold">{writeOffTarget.reason}</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Yo'qotiladigan qoldiq: <span className="font-bold">{formatUZS(writeOffTarget.remainingAmount)}</span>
              </span>
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Yo'qotish deb belgilangach, bu summa haqiqiy chiqimga aylanadi va foyda hisobiga ta'sir qiladi.
            </p>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Sabab</label>
              <textarea
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Masalan: Xodim ishdan ketdi, qaytarib bo'lmadi"
              />
            </div>
            {writeOffError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{writeOffError}</div>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => { setWriteOffTarget(null); setWriteOffReason(''); setWriteOffError(''); }}
              >
                Yopish
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => {
                  const r = writeOffReason.trim();
                  if (r.length < 3) {
                    setWriteOffError('Sababini kamida 3 ta harf bilan yozing');
                    return;
                  }
                  writeOffMutation.mutate({ id: writeOffTarget.id, reason: r });
                }}
                disabled={writeOffMutation.isPending}
              >
                {writeOffMutation.isPending ? 'Yozilmoqda...' : 'Yo\'qotish'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

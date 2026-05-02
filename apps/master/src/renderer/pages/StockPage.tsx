import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, 
  RotateCcw, 
  PlusCircle, 
  MinusCircle,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Zap,
  Plus,
  Minus,
  Check,
  X
} from 'lucide-react';
import { stockApi, DailyStock } from '../api/stock';

export function StockPage() {
  const queryClient = useQueryClient();
  const [rowInputs, setRowInputs] = useState<Record<string, number>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  
  const { data: stockItems = [], isLoading, isFetching } = useQuery({
    queryKey: ['stock', 'today'],
    queryFn: () => stockApi.getToday(),
  });

  const setTodayMutation = useMutation({
    mutationFn: ({ entries, force }: { entries: any[], force?: boolean }) => stockApi.setToday(entries, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setRowInputs({});
    },
    onError: (err: any) => {
      alert(err.message || "Xatolik yuz berdi");
    }
  });

  const batchAddMutation = useMutation({
    mutationFn: ({ id, count }: { id: string, count: number }) => stockApi.addBatch(id, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setAdjustingId(null);
    },
    onError: (err: any) => {
      alert(err.message || "Xatolik yuz berdi");
    }
  });

  const batchRemoveMutation = useMutation({
    mutationFn: ({ id, count }: { id: string, count: number }) => stockApi.removeBatch(id, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setAdjustingId(null);
    },
    onError: (err: any) => {
      alert(err.message || "Xatolik yuz berdi");
    }
  });

  const handleSetRow = (menuItemId: string) => {
    const count = rowInputs[menuItemId] ?? 0;
    setTodayMutation.mutate({ entries: [{ menuItemId, count }] });
  };

  const startAdjust = (id: string, type: 'add' | 'remove') => {
    setAdjustingId(`${id}:${type}`);
    setAdjustAmount(0);
  };

  const handleAdjust = () => {
    if (!adjustingId || adjustAmount <= 0) return;
    const [id, type] = adjustingId.split(':');
    if (type === 'add') {
      batchAddMutation.mutate({ id, count: adjustAmount });
    } else {
      batchRemoveMutation.mutate({ id, count: adjustAmount });
    }
  };

  const handleReset = (id: string, name: string) => {
    if (confirm(`"${name}" uchun bugungi zaxirani qaytadan belgilamoqchimisiz? Bu barcha amallarni o'chirib yuboradi.`)) {
      setTodayMutation.mutate({ entries: [{ menuItemId: id, count: 0 }], force: true });
    }
  };

  if (isLoading && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-slate-500 font-medium">Zaxira ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  const missingInitialization = stockItems.some(item => !item.hasDailyRow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Zaxiralar</h1>
            <p className="text-slate-500">Bugungi tayyorlangan mahsulotlar hisobi</p>
          </div>
        </div>

        {isFetching && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      {missingInitialization && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <Zap size={20} className="text-amber-500 fill-amber-500" />
            <p className="text-sm font-bold text-amber-800">
              Diqqat: Ayrim mahsulotlar uchun bugungi zaxira hali belgilanmagan!
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mahsulot</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Holati</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockItems.map((item) => {
                const isLow = item.hasDailyRow && item.currentCount > 0 && item.currentCount < 5;
                const isOut = item.hasDailyRow && item.currentCount === 0;
                const isAdjusting = adjustingId?.startsWith(item.menuItemId);
                const adjustType = adjustingId?.split(':')[1];

                return (
                  <tr key={item.menuItemId} className={`hover:bg-slate-50/50 transition-colors ${!item.hasDailyRow ? 'bg-amber-50/20' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-slate-800 leading-tight">{item.name}</span>
                        {item.hasDailyRow ? (
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className={`text-sm font-black ${
                              isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-blue-600'
                            }`}>
                              {item.currentCount}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              dan {item.initialCount} ta mavjud (jami)
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">Hali belgilanmagan</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {!item.hasDailyRow ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black uppercase border border-slate-200">
                          <AlertTriangle size={12} />
                          <span>Kutilmoqda</span>
                        </span>
                      ) : isOut ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black uppercase border border-red-200">
                          <XCircle size={12} />
                          <span>Tugagan</span>
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase border border-amber-200">
                          <AlertTriangle size={12} />
                          <span>Kam qoldi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-black uppercase border border-green-200">
                          <CheckCircle2 size={12} />
                          <span>Mavjud</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!item.hasDailyRow ? (
                        <div className="flex items-center justify-end space-x-2">
                          <input 
                            type="number" 
                            placeholder="0"
                            className="w-20 border border-slate-200 rounded px-2 py-1.5 text-center font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            value={rowInputs[item.menuItemId] ?? ''}
                            onChange={(e) => setRowInputs(prev => ({ ...prev, [item.menuItemId]: parseInt(e.target.value) || 0 }))}
                          />
                          <button 
                            onClick={() => handleSetRow(item.menuItemId)}
                            disabled={setTodayMutation.isPending}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                          >
                            Ochish
                          </button>
                        </div>
                      ) : isAdjusting ? (
                        <div className="flex items-center justify-end space-x-2 animate-in slide-in-from-right-2 duration-200">
                          <div className={`text-[10px] font-black uppercase ${adjustType === 'add' ? 'text-green-600' : 'text-red-600'}`}>
                            {adjustType === 'add' ? '+ Partiya' : '- Xato'}
                          </div>
                          <input 
                            type="number" 
                            autoFocus
                            className="w-20 border border-slate-200 rounded px-2 py-1.5 text-center font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            value={adjustAmount || ''}
                            onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                          />
                          <button 
                            onClick={handleAdjust}
                            disabled={batchAddMutation.isPending || batchRemoveMutation.isPending}
                            className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"
                          >
                            <Check size={16} />
                          </button>
                          <button 
                            onClick={() => setAdjustingId(null)}
                            className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => startAdjust(item.menuItemId, 'add')}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors"
                          >
                            <PlusCircle size={14} />
                            <span>+ Partiya</span>
                          </button>
                          <button 
                            onClick={() => startAdjust(item.menuItemId, 'remove')}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                          >
                            <MinusCircle size={14} />
                            <span>- Xato</span>
                          </button>
                          <button 
                            onClick={() => handleReset(item.menuItemId, item.name)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Qayta sozlash"
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start space-x-3">
        <AlertTriangle className="text-slate-400 shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-slate-600">
          <p className="font-bold mb-1">Qoidalar:</p>
          <ul className="list-disc list-inside space-y-0.5 opacity-90 text-xs font-medium">
            <li><b>Ochish (Set):</b> Kun boshida ushbu mahsulotning umumiy miqdorini belgilaydi.</li>
            <li><b>+ Partiya:</b> Kun davomida qo'shimcha tayyorlansa (jami va mavjud ortadi).</li>
            <li><b>- Xato:</b> Buzilgan yoki noto'g'ri kiritilgan bo'lsa (faqat mavjud kamayadi).</li>
            <li>Zaxira 0 ga tushganda, mahsulot menyuda avtomatik yashiriladi.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

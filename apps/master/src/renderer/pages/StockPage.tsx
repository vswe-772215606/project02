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
  CalendarCheck,
  Zap
} from 'lucide-react';
import { stockApi, DailyStock } from '../api/stock';

export function StockPage() {
  const queryClient = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(false);
  const [initCounts, setInitCounts] = useState<Record<string, number>>({});
  
  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ['stock', 'today'],
    queryFn: () => stockApi.getToday(),
  });

  const setTodayMutation = useMutation({
    mutationFn: ({ entries, force }: { entries: any[], force?: boolean }) => stockApi.setToday(entries, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setIsInitializing(false);
      setInitCounts({});
    }
  });

  const batchAddMutation = useMutation({
    mutationFn: ({ id, count }: { id: string, count: number }) => stockApi.addBatch(id, count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock'] })
  });

  const batchRemoveMutation = useMutation({
    mutationFn: ({ id, count }: { id: string, count: number }) => stockApi.removeBatch(id, count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock'] })
  });

  const handleSetMorning = () => {
    const entries = Object.entries(initCounts)
      .filter(([_, count]) => count > 0)
      .map(([menuItemId, count]) => ({ menuItemId, count }));
    
    if (entries.length === 0) return;
    setTodayMutation.mutate({ entries });
  };

  const promptBatch = (id: string, name: string, type: 'add' | 'remove') => {
    const msg = type === 'add' 
      ? `"${name}" uchun yangi partiya miqdorini kiriting:` 
      : `"${name}" uchun yaroqsiz/buzilgan partiya miqdorini kiriting:`;
    const val = prompt(msg);
    if (!val) return;
    const count = parseInt(val, 10);
    if (isNaN(count) || count <= 0) {
      alert("Noto'g'ri miqdor kiritildi");
      return;
    }

    if (type === 'add') {
      batchAddMutation.mutate({ id, count });
    } else {
      batchRemoveMutation.mutate({ id, count });
    }
  };

  const handleReset = (id: string, name: string) => {
    if (confirm(`"${name}" uchun bugungi zaxirani qaytadan belgilamoqchimisiz?`)) {
      const val = prompt(`Yangi boshlang'ich miqdorni kiriting:`);
      if (!val) return;
      const count = parseInt(val, 10);
      if (isNaN(count) || count < 0) return;
      setTodayMutation.mutate({ entries: [{ menuItemId: id, count }], force: true });
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

  const uninitializedItems = stockItems.filter(item => !item.hasDailyRow);
  const initializedItems = stockItems.filter(item => item.hasDailyRow);

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

        {uninitializedItems.length > 0 && !isInitializing && (
          <button
            onClick={() => setIsInitializing(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all active:scale-95"
          >
            <CalendarCheck size={18} />
            <span>Bugun uchun belgilash</span>
          </button>
        )}
      </div>

      {isInitializing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-blue-800 flex items-center space-x-2">
              <Zap size={20} className="fill-blue-500 text-blue-500" />
              <span>Ertalabki tayyorgarlik (Morning routine)</span>
            </h2>
            <button 
              onClick={() => setIsInitializing(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <RotateCcw size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {uninitializedItems.map(item => (
              <div key={item.menuItemId} className="bg-white p-3 rounded-lg border border-blue-100 flex flex-col space-y-2">
                <span className="text-sm font-bold text-slate-700 truncate">{item.name}</span>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number" 
                    placeholder="0"
                    className="w-full border border-slate-200 rounded px-2 py-1 text-center font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => setInitCounts(prev => ({ ...prev, [item.menuItemId]: parseInt(e.target.value) || 0 }))}
                  />
                  <span className="text-xs text-slate-400 font-bold">ta</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-3">
            <button 
              onClick={() => setIsInitializing(false)}
              className="px-4 py-2 text-slate-600 font-bold hover:text-slate-800"
            >
              Bekor qilish
            </button>
            <button 
              onClick={handleSetMorning}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 shadow-md"
            >
              Barchasini tasdiqlash
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mahsulot nomi va holati</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initializedItems.map((item) => {
                const isLow = item.currentCount > 0 && item.currentCount < 5;
                const isOut = item.currentCount === 0;

                return (
                  <tr key={item.menuItemId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-slate-800 leading-tight">{item.name}</span>
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
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isOut ? (
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
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => promptBatch(item.menuItemId, item.name, 'add')}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors"
                        >
                          <PlusCircle size={14} />
                          <span>+ Yangi partiya</span>
                        </button>
                        <button 
                          onClick={() => promptBatch(item.menuItemId, item.name, 'remove')}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                        >
                          <MinusCircle size={14} />
                          <span>- Buzilgan/Xato</span>
                        </button>
                        <button 
                          onClick={() => handleReset(item.menuItemId, item.name)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Qayta sozlash"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {stockItems.length === 0 && (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Zaxirali mahsulotlar topilmadi</h3>
            <p className="text-slate-500 max-w-sm mx-auto">Menyuda birorta mahsulot "Zaxirani kuzatish" rejimida emas.</p>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start space-x-3">
        <AlertTriangle className="text-slate-400 shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-slate-600">
          <p className="font-bold mb-1">Qoidalar:</p>
          <ul className="list-disc list-inside space-y-0.5 opacity-90 text-xs font-medium">
            <li><b>Yangi partiya:</b> Kun davomida qo'shimcha mahsulot tayyorlansa ishlatiladi (jami va mavjud miqdor ortadi).</li>
            <li><b>Buzilgan/Xato:</b> Ovqat to'kilsa yoki yaroqsiz bo'lib qolsa ishlatiladi (faqat mavjud miqdor kamayadi).</li>
            <li>Zaxira 0 ga tushganda, ofitsiantlar ushbu mahsulotni buyurtma qila olmaydilar.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

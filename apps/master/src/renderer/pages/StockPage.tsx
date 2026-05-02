import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, 
  Save, 
  RotateCcw, 
  Plus, 
  Minus,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { stockApi, DailyStock } from '../api/stock';

export function StockPage() {
  const queryClient = useQueryClient();
  const [localCounts, setLocalCounts] = useState<Record<string, { initialCount: number; currentCount: number }>>({});
  const [touchedItems, setTouchedItems] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const { data: stockItems = [], isLoading, isFetching } = useQuery({
    queryKey: ['stock', 'today'],
    queryFn: () => stockApi.getToday(),
  });

  // Sync with background data for untouched items
  useEffect(() => {
    if (stockItems.length > 0) {
      setLocalCounts(prev => {
        const next = { ...prev };
        stockItems.forEach(item => {
          if (!touchedItems.has(item.menuItemId)) {
            next[item.menuItemId] = {
              initialCount: item.initialCount,
              currentCount: item.currentCount
            };
          }
        });
        return next;
      });
    }
  }, [stockItems, touchedItems]);

  const updateLocalCount = (menuItemId: string, field: 'initialCount' | 'currentCount', value: number) => {
    const val = Math.max(0, value);
    setLocalCounts(prev => ({
      ...prev,
      [menuItemId]: {
        ...prev[menuItemId],
        [field]: val
      }
    }));
    setTouchedItems(prev => new Set(prev).add(menuItemId));
  };

  const adjustCurrent = (menuItemId: string, amount: number) => {
    const current = localCounts[menuItemId]?.currentCount ?? 0;
    updateLocalCount(menuItemId, 'currentCount', current + amount);
  };

  const handleSave = async () => {
    if (touchedItems.size === 0) return;
    setIsSaving(true);
    try {
      // Get all touched items
      const touchedList = Array.from(touchedItems);
      
      // 1. Update initial counts in bulk
      const initialEntries = touchedList.map(id => ({
        menuItemId: id,
        count: localCounts[id].initialCount
      }));
      await stockApi.setToday(initialEntries);

      // 2. Adjust current counts individually if they differ from initial (or from what they were)
      // Note: setToday sets both initial and current to the same value.
      // So if the user specifically wanted a different current count, we must adjust it.
      for (const id of touchedList) {
        if (localCounts[id].currentCount !== localCounts[id].initialCount) {
          await stockApi.adjust(id, localCounts[id].currentCount);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      setTouchedItems(new Set());
    } catch (error) {
      console.error('Failed to save stock:', error);
      alert('Zaxirani saqlashda xatolik yuz berdi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTouchedItems(new Set());
    // The useEffect will restore values from stockItems on next render
  };

  if (isLoading && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-slate-500 font-medium">Zaxira ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  const hasChanges = touchedItems.size > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Zaxiralar</h1>
            <p className="text-slate-500">Bugungi mahsulotlar zaxirasi boshqaruvi</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors"
            >
              <RotateCcw size={18} />
              <span>Bekor qilish</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
              hasChanges && !isSaving
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save size={18} />
            <span>{isSaving ? 'Saqlanmoqda...' : 'Barchasini saqlash'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mahsulot nomi</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Kunlik jami (Ertalabki)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hozirda mavjud</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sotilgan</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Tezkor amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockItems.map((item) => {
                const local = localCounts[item.menuItemId] || { initialCount: 0, currentCount: 0 };
                const consumed = Math.max(0, local.initialCount - local.currentCount);
                const isLow = local.currentCount > 0 && local.currentCount < 5;
                const isOut = local.currentCount === 0;
                const isTouched = touchedItems.has(item.menuItemId);

                return (
                  <tr key={item.menuItemId} className={`hover:bg-slate-50/50 transition-colors ${isTouched ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        {isTouched && <span className="text-[10px] text-blue-500 font-bold uppercase">O'zgartirildi</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={local.initialCount}
                          onChange={(e) => updateLocalCount(item.menuItemId, 'initialCount', parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium text-center"
                        />
                        <span className="text-slate-400 text-sm">ta</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={local.currentCount}
                          onChange={(e) => updateLocalCount(item.menuItemId, 'currentCount', parseInt(e.target.value) || 0)}
                          className={`w-20 px-2 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-bold text-center ${
                            isOut ? 'border-red-200 bg-red-50 text-red-700' : 
                            isLow ? 'border-amber-200 bg-amber-50 text-amber-700' : 
                            'border-slate-200 text-slate-800'
                          }`}
                        />
                        <span className="text-slate-400 text-sm">ta</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        consumed > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'
                      }`}>
                        {consumed} ta
                      </span>
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
                      <div className="flex items-center justify-end">
                        <div className="flex rounded-md shadow-sm overflow-hidden border border-slate-200">
                          {[-10, -5, 5, 10, 20].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => adjustCurrent(item.menuItemId, amount)}
                              className={`px-2.5 py-1 text-[10px] font-black border-r border-slate-200 last:border-0 hover:bg-slate-100 transition-colors ${
                                amount < 0 ? 'text-red-500' : 'text-blue-600'
                              }`}
                              title={amount > 0 ? `+${amount}` : `${amount}`}
                            >
                              {amount > 0 ? `+${amount}` : amount}
                            </button>
                          ))}
                        </div>
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
            <p className="text-slate-500 max-w-sm mx-auto">Menyuda birorta mahsulot "Zaxirani kuzatish" rejimida emas. Buni Menyu bo'limidan sozlash mumkin.</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start space-x-3">
        <AlertTriangle className="text-blue-500 shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-blue-800">
          <p className="font-bold mb-1">Eslatma:</p>
          <ul className="list-disc list-inside space-y-0.5 opacity-90">
            <li>"Kunlik jami" - bu mahsulotning bugungi kun uchun tayyorlangan umumiy miqdori.</li>
            <li>"Hozirda mavjud" - bu ayni damda sotuvda qolgan miqdor.</li>
            <li>Zaxira 0 ga tushganda, mahsulot avtomatik ravishda menyuda "Mavjud emas" holatiga o'tadi.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

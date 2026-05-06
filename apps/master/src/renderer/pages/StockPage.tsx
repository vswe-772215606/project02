import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, 
  RefreshCw,
  Check,
  AlertCircle,
  X
} from 'lucide-react';
import { stockApi } from '../api/stock';

export function StockPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [successId, setSuccessId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: stockItems = [], isLoading, isFetching } = useQuery({
    queryKey: ['stock', 'today'],
    queryFn: () => stockApi.getToday(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, count }: { id: string, count: number }) => stockApi.setCount(id, count),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setEditingId(null);
      setSuccessId(variables.id);
      setTimeout(() => setSuccessId(null), 1000);
    },
    onError: (err: any) => {
      setSaveError(err.message || "Xatolik yuz berdi");
    }
  });

  const handleEdit = (id: string, currentCount: number) => {
    setEditingId(id);
    setEditValue(currentCount.toString());
  };

  const handleSave = (id: string) => {
    const count = parseInt(editValue);
    if (isNaN(count) || count < 0) return;
    updateMutation.mutate({ id, count });
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') handleSave(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  if (isLoading && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-slate-500 font-medium">Zaxira ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Zaxiralar</h1>
            <p className="text-slate-500">Bugungi mavjud miqdor</p>
          </div>
        </div>

        {isFetching && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      {saveError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 flex items-center justify-between">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="ml-4 text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {stockItems.map((item) => {
            const isEditing = editingId === item.menuItemId;
            const isSuccess = successId === item.menuItemId;
            
            let statusColor = 'bg-green-500';
            if (item.count === 0) statusColor = 'bg-red-500';
            else if (item.count <= 5) statusColor = 'bg-yellow-500';

            return (
              <div 
                key={item.menuItemId} 
                className={`flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors ${isSuccess ? 'bg-green-50' : ''}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-3 rounded-full ${statusColor} shadow-sm`} />
                  <span className="text-lg font-bold text-slate-800 leading-tight">
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  {isEditing ? (
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number" 
                        autoFocus
                        className="w-24 border-2 border-blue-500 rounded-xl px-3 py-2 text-center font-black text-lg outline-none shadow-sm"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, item.menuItemId)}
                      />
                      <button 
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur before click
                          handleSave(item.menuItemId);
                        }}
                        disabled={updateMutation.isPending}
                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                      >
                        {updateMutation.isPending ? <RefreshCw size={20} className="animate-spin" /> : <Check size={20} />}
                      </button>
                      <button 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditingId(null);
                        }}
                        className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleEdit(item.menuItemId, item.count)}
                      className={`min-w-[80px] px-4 py-2 rounded-xl text-2xl font-black text-center transition-all hover:bg-slate-100 ${
                        item.count === 0 ? 'text-red-600' : item.count <= 5 ? 'text-yellow-600' : 'text-blue-600'
                      }`}
                    >
                      {item.count}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {stockItems.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-400">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">Zaxira qilinadigan mahsulotlar topilmadi</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start space-x-3">
        <AlertCircle className="text-slate-400 shrink-0 mt-0.5" size={18} />
        <p className="text-sm text-slate-600 font-medium">
          Zaxira miqdorini o'zgartirish uchun raqam ustiga bosing. 0 ga tushgan mahsulotlar menyuda avtomatik yashiriladi.
        </p>
      </div>
    </div>
  );
}

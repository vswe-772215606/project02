import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Percent,
  Plus,
  Pencil,
  Trash2,
  Tag,
  AlertCircle,
  RotateCcw,
  Search,
  X
} from 'lucide-react';
import { discountsApi, Discount } from '../api/discounts';
import { settingsApi } from '../api/settings';
import { formatUZS } from '../utils/format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';

const discountSchema = z.object({
  name: z.string().min(1, "Nom kiritilishi shart"),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().min(0, "Qiymat noto'g'ri"),
});

type DiscountForm = z.infer<typeof discountSchema>;

export function DiscountsPage() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editDiscount, setEditDiscount] = useState<Discount | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['discounts', showInactive],
    queryFn: () => discountsApi.list(showInactive),
  });

  const filteredDiscounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discounts;
    return discounts.filter((d) => d.name.toLowerCase().includes(q));
  }, [discounts, search]);

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const createMutation = useMutation({
    mutationFn: (data: DiscountForm) => discountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setIsAdding(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Discount> }) => discountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setEditDiscount(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discounts'] })
  });

  const handleToggleActive = (discount: Discount) => {
    if (discount.isActive) {
      setPendingConfirm({
        message: `"${discount.name}" chegirmasini faolsizlantirmoqchimisiz?`,
        onConfirm: () => deleteMutation.mutate(discount.id),
      });
    } else {
      setPendingConfirm({
        message: `"${discount.name}" chegirmasini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: discount.id, data: { isActive: true } }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Percent className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Chegirmalar boshqaruvi</h1>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              checked={showInactive} 
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Faolsizlarni ko'rsatish</span>
          </label>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center space-x-2 shadow-sm"
          >
            <Plus size={20} />
            <span>Yangi chegirma</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Nom bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-700"
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredDiscounts.map((discount) => (
          <div key={discount.id} className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-all ${!discount.isActive ? 'bg-slate-50 border-dashed border-slate-300 opacity-60' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl border ${!discount.isActive ? 'bg-slate-200 text-slate-400 border-slate-300' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                {discount.type === 'PERCENT' ? <Percent size={24} /> : <Tag size={24} />}
              </div>
              <div className="flex items-center space-x-1">
                <button 
                  onClick={() => setEditDiscount(discount)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Pencil size={18} />
                </button>
                <button 
                  onClick={() => handleToggleActive(discount)}
                  className={`p-2 rounded-lg transition-all ${
                    discount.isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'
                  }`}
                  title={discount.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                >
                  {discount.isActive ? <Trash2 size={18} /> : <RotateCcw size={18} />}
                </button>
              </div>
            </div>

            <div>
              <h3 className={`text-lg font-black ${!discount.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'}`}>
                {discount.name}
              </h3>
              <p className={`text-2xl font-black mt-1 ${!discount.isActive ? 'text-slate-400' : 'text-blue-600'}`}>
                {discount.type === 'PERCENT' ? `${discount.value}%` : formatUZS(discount.value)}
              </p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                {discount.type === 'PERCENT' ? 'Foizli' : 'Belgilangan summa'}
              </p>
            </div>
          </div>
        ))}
        {filteredDiscounts.length === 0 && !isLoading && (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
            {search.trim() ? 'Qidiruv bo\'yicha hech narsa topilmadi' : 'Chegirmalar mavjud emas'}
          </div>
        )}
      </div>

      {(isAdding || editDiscount) && (
        <DiscountModal
          discount={editDiscount}
          settings={settings}
          onClose={() => { setIsAdding(false); setEditDiscount(null); }}
          onSave={(data: DiscountForm) => editDiscount
            ? updateMutation.mutate({ id: editDiscount.id, data })
            : createMutation.mutate(data)
          }
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          variant="danger"
          onConfirm={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}

function DiscountModal({ discount, settings, onClose, onSave }: any) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<DiscountForm>({
    resolver: zodResolver(discountSchema),
    defaultValues: discount || { name: '', type: 'PERCENT', value: 0 }
  });

  const selectedType = watch('type');
  const maxPercent = Number(settings.max_discount_percent || 100);
  const maxAmount = Number(settings.max_discount_amount || 1000000);

  const onSubmit = (data: DiscountForm) => {
    if (data.type === 'PERCENT' && data.value > maxPercent) {
      setFormError(`Chegirma foizi ${maxPercent}% dan oshmasligi kerak`);
      return;
    }
    if (data.type === 'FIXED' && data.value > maxAmount) {
      setFormError(`Chegirma summasi ${formatUZS(maxAmount)} dan oshmasligi kerak`);
      return;
    }
    onSave(data);
  };

  return (
    <Modal title={discount ? "Chegirmani tahrirlash" : "Yangi chegirma"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Chegirma nomi</label>
          <input 
            {...register('name')}
            className={`w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-500 bg-red-50' : 'border-slate-300'
            }`}
            placeholder="Masalan: 10% Bayramidagi chegirma"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Turi</label>
            <select 
              {...register('type')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="PERCENT">Foiz (%)</option>
              <option value="FIXED">Summa (UZS)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Qiymati</label>
            <input 
              type="number"
              {...register('value', { valueAsNumber: true })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 flex items-start space-x-3 mt-2">
          <AlertCircle className="text-amber-500 shrink-0" size={18} />
          <div className="text-xs text-amber-700 leading-relaxed font-medium">
            <p>Maksimal chegirma: <b>{selectedType === 'PERCENT' ? `${maxPercent}%` : formatUZS(maxAmount)}</b></p>
            <p className="mt-1">Chegirma qiymati ushbu miqdordan oshmasligi kerak.</p>
          </div>
        </div>

        {formError && <p className="text-xs text-red-600 font-semibold rounded-lg bg-red-50 px-3 py-2">{formError}</p>}

        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition-all"
          >
            Saqlash
          </button>
        </div>
      </form>
    </Modal>
  );
}

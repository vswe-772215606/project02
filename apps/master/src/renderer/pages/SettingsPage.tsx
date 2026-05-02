import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings as SettingsIcon, 
  Save, 
  Coins, 
  Printer, 
  Store, 
  Lock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { settingsApi } from '../api/settings';
import { useAuthStore } from '../stores/auth.store';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(s => s.user);
  const isOwner = currentUser?.role === 'OWNER';

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const [formState, setFormState] = useState<Record<string, string>>({});
  const [isSaved, setIsSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (changes: Record<string, string>) => {
      for (const [key, value] of Object.entries(changes)) {
        await settingsApi.update(key, value);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setIsSaved(true);
      setFormState({});
      setTimeout(() => setIsSaved(false), 3000);
    }
  });

  const handleChange = (key: string, value: string) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(formState).length === 0) return;
    updateMutation.mutate(formState);
  };

  const getVal = (key: string) => formState[key] ?? settings[key] ?? '';

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <SettingsIcon className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Tizim sozlamalari</h1>
        </div>
        
        {isSaved && (
          <div className="flex items-center space-x-2 text-green-600 font-bold text-sm animate-in fade-in slide-in-from-right-2 duration-300">
            <CheckCircle2 size={18} />
            <span>Saqlandi!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 pb-12">
        {/* Money Group */}
        <SettingsGroup title="Moliyaviy sozlamalar" icon={Coins}>
          <SettingItem 
            label="Xizmat haqi (UZS)" 
            description="Har bir buyurtma uchun qo'shiladigan doimiy summa"
            readonly={!isOwner}
          >
            <input 
              type="number" 
              value={getVal('service_charge_amount')}
              onChange={e => handleChange('service_charge_amount', e.target.value)}
              disabled={!isOwner}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>
          <SettingItem 
            label="Maksimal chegirma foizi (%)" 
            description="Adminlar ruxsat bera oladigan eng yuqori foizli chegirma"
            readonly={!isOwner}
          >
            <input 
              type="number" 
              value={getVal('max_discount_percent')}
              onChange={e => handleChange('max_discount_percent', e.target.value)}
              disabled={!isOwner}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>
          <SettingItem 
            label="Maksimal chegirma summasi (UZS)" 
            description="Adminlar ruxsat bera oladigan eng yuqori belgilangan summa"
            readonly={!isOwner}
          >
            <input 
              type="number" 
              value={getVal('max_discount_amount')}
              onChange={e => handleChange('max_discount_amount', e.target.value)}
              disabled={!isOwner}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>
        </SettingsGroup>

        {/* Printer Group */}
        <SettingsGroup title="Printer sozlamalari" icon={Printer}>
          <SettingItem 
            label="Kassa printeri nomi" 
            description="Tizimdagi kassa printerining aniq nomi"
          >
            <input 
              type="text" 
              value={getVal('admin_printer_name')}
              onChange={e => handleChange('admin_printer_name', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
          <SettingItem 
            label="Oshxona printeri nomi" 
            description="Tizimdagi oshxona printerining aniq nomi"
          >
            <input 
              type="text" 
              value={getVal('kitchen_printer_name')}
              onChange={e => handleChange('kitchen_printer_name', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
        </SettingsGroup>

        {/* Store Group */}
        <SettingsGroup title="Do'kon ma'lumotlari" icon={Store}>
          <SettingItem 
            label="Muassasa nomi" 
            description="Chekning yuqori qismida chiqadigan nom"
          >
            <input 
              type="text" 
              value={getVal('store_heading')}
              onChange={e => handleChange('store_heading', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
          <SettingItem 
            label="Telefon raqami" 
            description="Mijozlar uchun aloqa raqami"
          >
            <input 
              type="text" 
              value={getVal('store_phone')}
              onChange={e => handleChange('store_phone', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
          <SettingItem 
            label="Manzil" 
            description="Chekning quyi qismida chiqadigan manzil"
          >
            <input 
              type="text" 
              value={getVal('store_address')}
              onChange={e => handleChange('store_address', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
        </SettingsGroup>

        <div className="flex items-center justify-between p-6 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm sticky bottom-6 z-10">
          <div className="flex items-center space-x-3 text-blue-800">
            <AlertCircle size={20} />
            <span className="text-sm font-semibold">O'zgarishlarni saqlashni unutmang</span>
          </div>
          <button 
            type="submit"
            disabled={Object.keys(formState).length === 0 || updateMutation.isPending}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center space-x-2 transition-all active:scale-95"
          >
            {updateMutation.isPending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <Save size={20} />
                <span>SAQLASH</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsGroup({ title, icon: Icon, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex items-center space-x-2">
        <Icon size={18} className="text-slate-400" />
        <h2 className="font-bold text-slate-800 uppercase text-xs tracking-widest">{title}</h2>
      </div>
      <div className="p-6 divide-y divide-slate-50">
        {children}
      </div>
    </div>
  );
}

function SettingItem({ label, description, readonly, children }: any) {
  return (
    <div className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-bold text-slate-800">{label}</label>
          {readonly && <Lock size={12} className="text-slate-400" />}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className="md:col-span-2 flex items-center">
        {children}
      </div>
    </div>
  );
}

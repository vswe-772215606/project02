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
  AlertCircle,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { settingsApi } from '../api/settings';
import { useAuthStore } from '../stores/auth.store';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
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
    },
  });

  const handleChange = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
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
        <SettingsGroup title="Moliyaviy sozlamalar" icon={Coins}>
          <SettingItem
            label="Maksimal chegirma foizi (%)"
            description="Adminlar ruxsat bera oladigan eng yuqori foizli chegirma"
            readonly={!isOwner}
          >
            <input
              type="number"
              value={getVal('max_discount_percent')}
              onChange={(e) => handleChange('max_discount_percent', e.target.value)}
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
              onChange={(e) => handleChange('max_discount_amount', e.target.value)}
              disabled={!isOwner}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>
        </SettingsGroup>

        <PrinterSettingsGroup
          getVal={getVal}
          onChange={handleChange}
        />

        <SettingsGroup title="Telegram bot sozlamalari" icon={Send}>
          <SettingItem
            label="Kunlik hisobot (Telegram)"
            description="Har kuni belgilangan vaqtda ownerga hisobot yuborish"
            readonly={!isOwner}
          >
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                disabled={!isOwner}
                aria-checked={getVal('daily_report_telegram_enabled') === 'true'}
                onClick={() => handleChange('daily_report_telegram_enabled', getVal('daily_report_telegram_enabled') === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                  getVal('daily_report_telegram_enabled') === 'true' ? 'bg-blue-600' : 'bg-slate-200'
                } disabled:opacity-50`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                    getVal('daily_report_telegram_enabled') === 'true' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {getVal('daily_report_telegram_enabled') === 'true' ? 'Yoqilgan' : 'O\'chirilgan'}
              </span>
            </label>
          </SettingItem>

          <SettingItem
            label="Bot token"
            description="Telegram @BotFather orqali olingan token"
            readonly={!isOwner}
          >
            <input
              type="password"
              value={getVal('telegram_bot_token')}
              onChange={(e) => handleChange('telegram_bot_token', e.target.value)}
              disabled={!isOwner}
              placeholder="123456789:ABCDEF..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>

          <SettingItem
            label="Owner Chat ID"
            description="Hisobot yuboriladigan foydalanuvchi ID raqami"
            readonly={!isOwner}
          >
            <input
              type="text"
              value={getVal('owner_telegram_chat_id')}
              onChange={(e) => handleChange('owner_telegram_chat_id', e.target.value)}
              disabled={!isOwner}
              placeholder="123456789"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>

          <SettingItem
            label="Hisobot vaqti"
            description="Har kuni qaysi vaqtda hisobot yuborilsin (HH:mm)"
            readonly={!isOwner}
          >
            <input
              type="time"
              value={getVal('daily_report_telegram_time')}
              onChange={(e) => handleChange('daily_report_telegram_time', e.target.value)}
              disabled={!isOwner}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </SettingItem>
        </SettingsGroup>

        <SettingsGroup title="Do'kon ma'lumotlari" icon={Store}>
          <SettingItem
            label="Muassasa nomi"
            description="Chekning yuqori qismida chiqadigan nom"
          >
            <input
              type="text"
              value={getVal('store_heading')}
              onChange={(e) => handleChange('store_heading', e.target.value)}
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
              onChange={(e) => handleChange('store_phone', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingItem>
          <SettingItem
            label="Manzil"
            description="Chekning yuqori qismida chiqadigan manzil"
          >
            <input
              type="text"
              value={getVal('store_address')}
              onChange={(e) => handleChange('store_address', e.target.value)}
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
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
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

function PrinterSettingsGroup({
  getVal,
  onChange,
}: {
  getVal: (key: string) => string;
  onChange: (key: string, value: string) => void;
}) {
  const {
    data: printersData,
    isLoading: printersLoading,
    isFetching: printersFetching,
    refetch: refetchPrinters,
  } = useQuery({
    queryKey: ['printers'],
    queryFn: () => settingsApi.getPrinters(),
    staleTime: 30_000,
  });

  const availablePrinters = printersData?.printers ?? [];

  const adminPrinter = getVal('admin_printer_name');

  const adminMissing = adminPrinter && availablePrinters.length > 0 && !availablePrinters.includes(adminPrinter);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Printer size={18} className="text-slate-400" />
          <h2 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Printer sozlamalari</h2>
        </div>
        <button
          type="button"
          onClick={() => refetchPrinters()}
          disabled={printersFetching}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50 transition-colors"
          title="Printerlar ro'yxatini yangilash"
        >
          <RefreshCw size={13} className={printersFetching ? 'animate-spin' : ''} />
          Yangilash
        </button>
      </div>

      <div className="p-6 divide-y divide-slate-50">
        <SettingItem
          label="Kassa printeri nomi"
          description="Hisob cheki chiqaradigan printer"
        >
          <div className="w-full space-y-2">
            <PrinterSelect
              value={adminPrinter}
              printers={availablePrinters}
              isLoading={printersLoading}
              onChange={(v) => onChange('admin_printer_name', v)}
              placeholder="Printer tanlang yoki nomini kiriting"
            />
            {adminMissing && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <AlertTriangle size={13} />
                <span>"{adminPrinter}" tizimda topilmadi</span>
              </div>
            )}
            {availablePrinters.length === 0 && !printersLoading && (
              <p className="text-xs text-slate-400">
                Tizimdan printerlar topilmadi — nomni qo'lda kiriting
              </p>
            )}
          </div>
        </SettingItem>
      </div>
    </div>
  );
}

function PrinterSelect({
  value,
  printers,
  isLoading,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  printers: string[];
  isLoading: boolean;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [manualMode, setManualMode] = useState(
    () => value !== '' && printers.length > 0 && !printers.includes(value),
  );

  const isInList = printers.includes(value);
  const showDropdown = printers.length > 0 && !manualMode;

  return (
    <div className="flex gap-2">
      {showDropdown ? (
        <div className="relative flex-1">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || isLoading}
            className="w-full appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="">{isLoading ? 'Yuklanmoqda...' : placeholder}</option>
            {printers.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
        />
      )}

      {printers.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setManualMode((m) => !m);
            if (!manualMode && !isInList) onChange('');
          }}
          className="shrink-0 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          title={manualMode ? "Ro'yxatdan tanlash" : "Qo'lda kiritish"}
        >
          {manualMode ? 'Ro\'yxat' : 'Qo\'lda'}
        </button>
      )}
    </div>
  );
}

function SettingsGroup({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
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

function SettingItem({
  label,
  description,
  readonly,
  children,
}: {
  label: string;
  description: string;
  readonly?: boolean;
  children: React.ReactNode;
}) {
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

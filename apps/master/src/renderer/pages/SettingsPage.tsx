import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Coins,
  Printer,
  Store,
  AlertCircle,
  Send,
  Save,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

import { settingsApi } from '../api/settings';
import { useAuthStore } from '../stores/auth.store';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SettingsGroup } from '@/components/settings/SettingsGroup';
import { SettingField } from '@/components/settings/SettingField';
import { SettingsToggle } from '@/components/settings/SettingsToggle';
import { PrinterPicker } from '@/components/settings/PrinterPicker';

/**
 * Sozlamalar — rebuilt on Blocks C1.
 *
 * The old page hardcoded `border-slate-300` / `rounded-lg` / `bg-blue-600`
 * throughout and capped itself at `max-w-4xl`, leaving wide idle margins on
 * a monitor the shell targets at ≥1366px (UI/UX audit §5). Nothing here
 * changes what a setting does — same keys, same `settingsApi` calls, same
 * OWNER-only gating — only how it's laid out and drawn.
 */
export function SettingsPage() {
  usePageTitle('Sozlamalar');
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(formState).length === 0) return;
    updateMutation.mutate(formState);
  };

  const getVal = (key: string) => formState[key] ?? settings[key] ?? '';
  const dirty = Object.keys(formState).length > 0;

  return (
    <Screen title="Sozlamalar" status={isSaved ? <Chip tone="settled">Saqlandi</Chip> : null}>
      {isLoading ? (
        <div className="flex h-full items-center justify-center bg-field px-pad py-16 text-center text-[14px] text-muted-foreground">
          Yuklanmoqda…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col gap-seam">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-1 gap-pad p-pad lg:grid-cols-2 lg:items-start">
              {/* Left column — money, printing, the shop's own identity. */}
              <div className="flex flex-col gap-pad">
                <SettingsGroup title="Moliyaviy sozlamalar" icon={Coins}>
                  <SettingField
                    label="Maksimal chegirma foizi (%)"
                    description="Adminlar ruxsat bera oladigan eng yuqori foizli chegirma"
                    readonly={!isOwner}
                  >
                    <Input
                      type="number"
                      value={getVal('max_discount_percent')}
                      onChange={(e) => handleChange('max_discount_percent', e.target.value)}
                      disabled={!isOwner}
                      numeric
                    />
                  </SettingField>
                  <SettingField
                    label="Maksimal chegirma summasi (UZS)"
                    description="Adminlar ruxsat bera oladigan eng yuqori belgilangan summa"
                    readonly={!isOwner}
                  >
                    <Input
                      type="number"
                      value={getVal('max_discount_amount')}
                      onChange={(e) => handleChange('max_discount_amount', e.target.value)}
                      disabled={!isOwner}
                      numeric
                    />
                  </SettingField>
                </SettingsGroup>

                <PrinterSettingsGroup getVal={getVal} onChange={handleChange} />

                <SettingsGroup title="Do'kon ma'lumotlari" icon={Store}>
                  <SettingField label="Muassasa nomi" description="Chekning yuqori qismida chiqadigan nom">
                    <Input
                      type="text"
                      value={getVal('store_heading')}
                      onChange={(e) => handleChange('store_heading', e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Telefon raqami" description="Mijozlar uchun aloqa raqami">
                    <Input
                      type="text"
                      value={getVal('store_phone')}
                      onChange={(e) => handleChange('store_phone', e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Manzil" description="Chekning yuqori qismida chiqadigan manzil">
                    <Input
                      type="text"
                      value={getVal('store_address')}
                      onChange={(e) => handleChange('store_address', e.target.value)}
                    />
                  </SettingField>
                </SettingsGroup>
              </div>

              {/* Right column — Telegram: the daily report and the alert triggers. */}
              <div className="flex flex-col gap-pad">
                <SettingsGroup title="Telegram bot sozlamalari" icon={Send}>
                  <SettingField
                    label="Kunlik hisobot (Telegram)"
                    description="Har kuni belgilangan vaqtda ownerga hisobot yuborish"
                    readonly={!isOwner}
                  >
                    <SettingsToggle
                      value={getVal('daily_report_telegram_enabled') === 'true'}
                      onChange={(v) => handleChange('daily_report_telegram_enabled', v ? 'true' : 'false')}
                      disabled={!isOwner}
                    />
                  </SettingField>
                  <SettingField
                    label="Bot token"
                    description="Telegram @BotFather orqali olingan token"
                    readonly={!isOwner}
                  >
                    <Input
                      type="password"
                      value={getVal('telegram_bot_token')}
                      onChange={(e) => handleChange('telegram_bot_token', e.target.value)}
                      disabled={!isOwner}
                      placeholder="123456789:ABCDEF..."
                    />
                  </SettingField>
                  <SettingField
                    label="Owner Chat ID"
                    description="Hisobot yuboriladigan foydalanuvchi ID raqami"
                    readonly={!isOwner}
                  >
                    <Input
                      type="text"
                      value={getVal('owner_telegram_chat_id')}
                      onChange={(e) => handleChange('owner_telegram_chat_id', e.target.value)}
                      disabled={!isOwner}
                      placeholder="123456789"
                    />
                  </SettingField>
                  <SettingField
                    label="Hisobot vaqti"
                    description="Har kuni qaysi vaqtda hisobot yuborilsin (HH:mm)"
                    readonly={!isOwner}
                  >
                    <Input
                      type="time"
                      value={getVal('daily_report_telegram_time')}
                      onChange={(e) => handleChange('daily_report_telegram_time', e.target.value)}
                      disabled={!isOwner}
                      numeric
                    />
                  </SettingField>
                </SettingsGroup>

                <SettingsGroup title="Tezkor ogohlantirishlar (Telegram)" icon={AlertCircle}>
                  <SettingField
                    label="Ogohlantirishlar"
                    description="Muhim hodisalarda darhol xabar: to'lamay ketish, katta chegirma/chiqim, nasiya sotuv, qarz yo'qotish, mahsulot tugashi"
                    readonly={!isOwner}
                  >
                    <SettingsToggle
                      value={getVal('alerts_telegram_enabled') !== 'false'}
                      onChange={(v) => handleChange('alerts_telegram_enabled', v ? 'true' : 'false')}
                      disabled={!isOwner}
                    />
                  </SettingField>
                  <SettingField
                    label="Katta chegirma chegarasi (so'm)"
                    description="Shu summadan katta chegirma qo'llanilsa xabar keladi"
                    readonly={!isOwner}
                  >
                    <Input
                      type="number"
                      min="0"
                      step="10000"
                      value={getVal('alert_discount_threshold')}
                      onChange={(e) => handleChange('alert_discount_threshold', e.target.value)}
                      disabled={!isOwner}
                      placeholder="50000"
                      numeric
                    />
                  </SettingField>
                  <SettingField
                    label="Katta chiqim chegarasi (so'm)"
                    description="Shu summadan katta chiqim kiritilsa xabar keladi"
                    readonly={!isOwner}
                  >
                    <Input
                      type="number"
                      min="0"
                      step="10000"
                      value={getVal('alert_expense_threshold')}
                      onChange={(e) => handleChange('alert_expense_threshold', e.target.value)}
                      disabled={!isOwner}
                      placeholder="500000"
                      numeric
                    />
                  </SettingField>
                  <SettingField
                    label="Mahsulot tugashi haqida xabar"
                    description="Sotuvda biror mahsulot zaxirasi 0 ga tushsa xabar"
                    readonly={!isOwner}
                  >
                    <SettingsToggle
                      value={getVal('alert_low_stock_enabled') !== 'false'}
                      onChange={(v) => handleChange('alert_low_stock_enabled', v ? 'true' : 'false')}
                      disabled={!isOwner}
                    />
                  </SettingField>
                </SettingsGroup>
              </div>
            </div>
          </div>

          {/* Pinned to the bottom of the work area — not a floating card. */}
          <div className="flex shrink-0 items-center justify-between gap-3 bg-field p-pad">
            <span className="text-[13px] text-muted-foreground">
              {dirty ? "O'zgarishlar bor — saqlashni unutmang" : "Barcha o'zgarishlar saqlangan"}
            </span>
            <Button
              type="submit"
              size="action"
              disabled={!dirty || updateMutation.isPending}
              className="min-w-[240px] justify-center"
            >
              <Save className="h-[18px] w-[18px]" />
              {updateMutation.isPending ? 'Saqlanmoqda…' : 'SAQLASH'}
            </Button>
          </div>
        </form>
      )}
    </Screen>
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
    <SettingsGroup
      title="Printer sozlamalari"
      icon={Printer}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refetchPrinters()}
          disabled={printersFetching}
          title="Printerlar ro'yxatini yangilash"
        >
          <RefreshCw className={cn('h-4 w-4', printersFetching && 'animate-spin')} />
          Yangilash
        </Button>
      }
    >
      <SettingField label="Kassa printeri nomi" description="Hisob cheki chiqaradigan printer">
        <div className="flex flex-col gap-2">
          <PrinterPicker
            value={adminPrinter}
            printers={availablePrinters}
            isLoading={printersLoading}
            onChange={(v) => onChange('admin_printer_name', v)}
            placeholder="Printer tanlang yoki nomini kiriting"
          />
          {adminMissing ? (
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>"{adminPrinter}" tizimda topilmadi</span>
            </div>
          ) : null}
          {availablePrinters.length === 0 && !printersLoading ? (
            <p className="text-[13px] text-muted-foreground">
              Tizimdan printerlar topilmadi — nomni qo'lda kiriting
            </p>
          ) : null}
        </div>
      </SettingField>
    </SettingsGroup>
  );
}

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
  Download,
} from 'lucide-react';

import { settingsApi } from '../api/settings';
import { useAuthStore } from '../stores/auth.store';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Chip, Field, FieldLabel } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SettingsGroup } from '@/components/settings/SettingsGroup';
import { SettingField } from '@/components/settings/SettingField';
import { SettingsToggle } from '@/components/settings/SettingsToggle';
import { PrinterPicker } from '@/components/settings/PrinterPicker';
import { formatDateTime } from '@/lib/format';
import { updaterSettingsModel } from '@/lib/updater-view';
import { useUpdaterStore } from '@/stores/updater.store';

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
              {/* Left column — the build itself, then money, printing and the
                  shop's own identity. */}
              <div className="flex flex-col gap-pad">
                {/* First, and above the fold on a 623px panel: this is the
                    block somebody is told to read out over the phone, and the
                    only place a check can be started by hand. */}
                <UpdateSettingsGroup />

                <SettingsGroup title="Moliyaviy sozlamalar" icon={Coins}>
                  <SettingField
                    label="Maksimal chegirma summasi (UZS)"
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
                  <SettingField label="Muassasa nomi">
                    <Input
                      type="text"
                      value={getVal('store_heading')}
                      onChange={(e) => handleChange('store_heading', e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Telefon raqami">
                    <Input
                      type="text"
                      value={getVal('store_phone')}
                      onChange={(e) => handleChange('store_phone', e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Manzil">
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
      <SettingField label="Kassa printeri nomi">
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

/**
 * Dastur yangilanishi — the version the till is running, and the only manual
 * route to a check or an install.
 *
 * It lives on this screen rather than in the hub because the hub is a set of
 * six doors onto other screens and this is one group of two rows, and because
 * `lib/navigation.ts` shows the rail is already at its ten-slot ceiling.
 * Everything else in `Tizim sozlamalari` describes how this installation
 * behaves; so does this.
 *
 * It renders as `Field`s rather than `SettingField`s: that primitive spends a
 * 300px track on its label, which leaves roughly 190px for the control in this
 * two-column layout — not enough for two buttons at the 48px touch floor, and
 * this screen already has an open horizontal-overflow finding. A status block
 * is not a labelled input anyway.
 *
 * Absent entirely when the build has no update feed — dev runs, the browser
 * preview, the gallery, and the `next` variant.
 */
function UpdateSettingsGroup() {
  const state = useUpdaterStore((s) => s.state);
  const check = useUpdaterStore((s) => s.check);
  const openPrompt = useUpdaterStore((s) => s.openPrompt);
  const model = updaterSettingsModel(state);

  if (!model.visible) return null;

  return (
    <SettingsGroup title="Dastur yangilanishi" icon={Download}>
      <Field className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel>Joriy versiya</FieldLabel>
          <div className="mt-1 text-[17px] font-semibold tabular-nums">{state.currentVersion}</div>
        </div>
        <Chip tone={model.stateTone}>{model.stateWord}</Chip>
      </Field>

      <Field className="flex flex-col gap-3">
        {model.showLine ? <span className="text-[13px]">{model.line}</span> : null}
        <div className="flex flex-wrap items-center gap-seam">
          {model.canInstall ? (
            <Button type="button" size="action" onClick={() => void openPrompt()}>
              Hozir o'rnatish
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void check()}
            disabled={model.checkDisabled}
          >
            <RefreshCw className={cn('h-4 w-4', state.status === 'checking' && 'animate-spin')} />
            {model.checkLabel}
          </Button>
        </div>
        <span className="text-[12px] text-muted-foreground">
          Oxirgi tekshiruv:{' '}
          {state.lastCheckedAt === null ? '—' : formatDateTime(new Date(state.lastCheckedAt))}
        </span>
      </Field>
    </SettingsGroup>
  );
}

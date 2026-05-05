import React, { useMemo, useState } from 'react';
import { RotateCcw, Save, Server, ShieldCheck, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { useMasterUrl } from '../providers/MasterUrlProvider';

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Hali yo'q";
  }

  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { masterUrl, setMasterUrl, clearMasterUrl } = useMasterUrl();
  const logout = useAuthStore((s) => s.logout);
  const lastSuccessfulContact = useConnectionStore((s) => s.lastSuccessfulContact);
  const markSuccessfulContact = useConnectionStore((s) => s.markSuccessfulContact);
  const [testState, setTestState] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | 'reset' | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [urlInput, setUrlInput] = useState(masterUrl ?? '');
  const [formError, setFormError] = useState('');

  const currentUrl = useMemo(() => masterUrl ?? 'Server tanlanmagan', [masterUrl]);

  const handleTest = async () => {
    if (!masterUrl) {
      setTestState('error');
      setTestMessage('Server manzili tanlanmagan.');
      return;
    }

    setBusy('test');
    setTestState('idle');
    setTestMessage('');
    try {
      await checkServerHealth(masterUrl);
      markSuccessfulContact();
      setTestState('success');
      setTestMessage('Server javob berdi.');
    } catch (error) {
      setTestState('error');
      setTestMessage(`Server topilmadi. ${getErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    const url = normalizeUrl(urlInput);
    if (!url) {
      setFormError('Server manzilini kiriting.');
      return;
    }

    setBusy('save');
    setFormError('');
    try {
      await checkServerHealth(url);
      await setMasterUrl(url);
      markSuccessfulContact();
      logout();
      window.location.reload();
    } catch (error) {
      setFormError(`Serverni tekshirib bo'lmadi: ${getErrorMessage(error)}`);
      setBusy(null);
    }
  };

  const handleReset = async () => {
    setBusy('reset');
    await clearMasterUrl();
    logout();
    setConfirmReset(false);
    onClose();
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-3xl rounded-[32px] bg-white shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white px-8 py-7 flex items-start justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Kitchen</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Server sozlamalari</h1>
            <p className="mt-2 text-slate-300">Hozirgi server: <span className="font-mono text-white">{currentUrl}</span></p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 p-3 hover:bg-white/20 transition-colors"
            aria-label="Yopish"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-8 space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center gap-3 text-slate-500 text-sm font-black uppercase tracking-[0.18em]">
              <ShieldCheck size={18} />
              <span>Oxirgi muvaffaqiyatli aloqa</span>
            </div>
            <div className="mt-3 text-2xl font-black text-slate-900">{formatDateTime(lastSuccessfulContact)}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={busy !== null}
              className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-left hover:bg-emerald-100 transition-colors disabled:opacity-60"
            >
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Aloqani tekshirish</div>
              <div className="mt-2 text-slate-700 text-sm">`/api/health` orqali serverga chiqadi.</div>
            </button>

            <button
              type="button"
              onClick={() => { setEditing(true); setConfirmReset(false); setUrlInput(masterUrl ?? ''); }}
              disabled={busy !== null}
              className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-5 text-left hover:bg-blue-100 transition-colors disabled:opacity-60"
            >
              <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">Serverni o'zgartirish</div>
              <div className="mt-2 text-slate-700 text-sm">Yangi URL ni tekshiradi va saqlaydi.</div>
            </button>

            <button
              type="button"
              onClick={() => { setConfirmReset(true); setEditing(false); }}
              disabled={busy !== null}
              className="rounded-3xl border border-red-200 bg-red-50 px-5 py-5 text-left hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              <div className="text-sm font-black uppercase tracking-[0.18em] text-red-700">Aloqani tiklash</div>
              <div className="mt-2 text-slate-700 text-sm">Server manzilini tozalab, sozlash oynasiga qaytadi.</div>
            </button>
          </div>

          {testState !== 'idle' && (
            <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${
              testState === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testMessage}
            </div>
          )}

          {editing && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 text-slate-900">
                <Server size={18} />
                <h2 className="text-lg font-black">Yangi server manzili</h2>
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(event) => { setUrlInput(event.target.value); setFormError(''); }}
                placeholder="http://192.168.1.50:4000"
                className="w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-base font-medium outline-none focus:border-blue-500"
              />
              {formError && <p className="text-sm font-bold text-red-600">{formError}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setFormError(''); setUrlInput(masterUrl ?? ''); }}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black uppercase tracking-widest text-slate-600"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={busy === 'save'}
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 disabled:opacity-60"
                >
                  <Save size={16} />
                  {busy === 'save' ? 'Tekshirilmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          )}

          {confirmReset && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 space-y-4">
              <h2 className="text-lg font-black text-red-700">Aloqani tiklash</h2>
              <p className="text-sm text-red-700">Server manzili o'chiriladi va dastur sozlash ekraniga qaytadi.</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-2xl border border-red-200 px-5 py-3 text-sm font-black uppercase tracking-widest text-red-700"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={busy === 'reset'}
                  className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 disabled:opacity-60"
                >
                  <RotateCcw size={16} />
                  {busy === 'reset' ? 'Tozalanmoqda...' : 'Tiklash'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

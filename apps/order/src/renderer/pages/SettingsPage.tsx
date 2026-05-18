import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RotateCcw, Save, Server } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { useMasterUrl } from '@/providers/MasterUrlProvider';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '@/lib/network';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function SettingsPage() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { masterUrl, setMasterUrl, clearMasterUrl } = useMasterUrl();
  const lastSuccessfulContact = useConnectionStore((s) => s.lastSuccessfulContact);
  const status = useConnectionStore((s) => s.status);
  const markSuccessfulContact = useConnectionStore((s) => s.markSuccessfulContact);

  const [busy, setBusy] = useState<'test' | 'save' | 'reset' | null>(null);
  const [urlInput, setUrlInput] = useState(masterUrl ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const handleTest = async () => {
    if (!masterUrl) {
      setFeedback({ kind: 'error', message: 'Server tanlanmagan' });
      return;
    }
    setBusy('test');
    setFeedback(null);
    try {
      await checkServerHealth(masterUrl);
      markSuccessfulContact();
      setFeedback({ kind: 'success', message: 'Server javob berdi' });
    } catch (err) {
      setFeedback({ kind: 'error', message: `Server javob bermadi: ${getErrorMessage(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    const url = normalizeUrl(urlInput);
    if (!url) {
      setFeedback({ kind: 'error', message: 'Server manzilini kiriting' });
      return;
    }
    setBusy('save');
    setFeedback(null);
    try {
      await checkServerHealth(url);
      await setMasterUrl(url);
      markSuccessfulContact();
      setFeedback({ kind: 'success', message: 'Server saqlandi' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: `Serverni tekshirib bo'lmadi: ${getErrorMessage(err)}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleResetServer = async () => {
    setBusy('reset');
    try {
      await clearMasterUrl();
      clearAuth();
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local logout always succeeds.
    } finally {
      clearAuth();
      nav('/login', { replace: true });
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Sozlamalar</h2>
        <p className="text-sm text-muted-foreground">
          Server manzili, diagnostika va chiqish
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold">Foydalanuvchi</div>
            <div className="text-xs text-muted-foreground">{user?.fullName ?? '—'}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4 mr-1" />
            Chiqish
          </Button>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Server</div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="server-url">Master URL</Label>
          <Input
            id="server-url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setFeedback(null);
            }}
            placeholder="http://192.168.1.50:4000"
          />
          <div className="text-xs text-muted-foreground">
            Joriy: <span className="font-mono">{masterUrl ?? 'tanlanmagan'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => void handleTest()} disabled={busy !== null}>
            {busy === 'test' ? 'Tekshirilmoqda...' : 'Aloqani tekshirish'}
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy !== null}>
            <Save className="h-4 w-4 mr-1" />
            {busy === 'save' ? 'Saqlanmoqda...' : 'Saqlash'}
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => void handleResetServer()}
            disabled={busy !== null}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {busy === 'reset' ? 'Tozalanmoqda...' : 'Aloqani tiklash'}
          </Button>
        </div>

        {feedback && (
          <div
            className={`rounded-md text-sm px-3 py-2 ${
              feedback.kind === 'success'
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Holat</div>
            <div className="font-medium">{status}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Oxirgi ulanish
            </div>
            <div className="font-medium">{formatDateTime(lastSuccessfulContact)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Delete } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { cn } from '../lib/utils';
import { Button } from '@/components/ui/button';

export function LoginPage() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const logoutMessage = useAuthStore((s) => s.logoutMessage);
  const clearLogoutMessage = useAuthStore((s) => s.clearLogoutMessage);
  const { masterUrl } = useMasterUrl();

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const diff = lockedUntil.getTime() - Date.now();
      if (diff <= 0) {
        setLockedUntil(null);
        setCountdown('');
        return;
      }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const doLogin = useCallback(
    async (pinValue: string) => {
      setLoading(true);
      setError(null);
      try {
        const { token, user } = await authApi.loginPin({ pin: pinValue });
        setAuth(token, user);
        clearLogoutMessage();
        nav('/', { replace: true });
      } catch (err) {
        const e = err as Error & { code?: string; details?: { until?: string } };
        if (e.code === 'LOCKED') {
          const until = e.details?.until
            ? new Date(e.details.until)
            : new Date(Date.now() + 5 * 60 * 1000);
          setLockedUntil(until);
        } else {
          setError("Noto'g'ri PIN");
        }
        setPin('');
      } finally {
        setLoading(false);
      }
    },
    [setAuth, clearLogoutMessage, nav],
  );

  useEffect(() => {
    if (pin.length === 4 && !loading && !lockedUntil) {
      void doLogin(pin);
    }
  }, [pin, loading, lockedUntil, doLogin]);

  const isDisabled = loading || !!lockedUntil;

  const handlePress = (digit: string) => {
    if (isDisabled || pin.length >= 4) return;
    setError(null);
    setPin((prev) => prev + digit);
  };

  const handleBackspace = () => {
    if (isDisabled) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="sm" onClick={() => nav('/server-setup')}>
          Server: {masterUrl ?? 'tanlanmagan'}
        </Button>
      </div>

      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-primary mb-1">Chayxana</h1>
        <p className="text-sm text-muted-foreground">PIN kodni kiriting</p>
      </div>

      {logoutMessage && (
        <div className="mb-4 px-4 py-2 rounded-md bg-warning/10 text-warning text-sm">
          {logoutMessage}
        </div>
      )}

      <div className="flex gap-4 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full border-2 transition-colors',
              error ? 'border-destructive bg-destructive' : 'border-primary',
              pin.length > i && !error && 'bg-primary',
            )}
          />
        ))}
      </div>

      <div className="h-12 flex items-center justify-center mb-2">
        {lockedUntil ? (
          <div className="text-center">
            <div className="text-destructive font-semibold text-sm">Hisob bloklangan</div>
            <div className="text-xs text-muted-foreground mt-1">Qayta urinish: {countdown}</div>
          </div>
        ) : error ? (
          <div className="text-destructive font-semibold text-sm">{error}</div>
        ) : loading ? (
          <div className="text-muted-foreground text-sm">Tekshirilmoqda...</div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3 w-72">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            disabled={isDisabled}
            onClick={() => handlePress(String(d))}
            className={cn(
              'h-16 rounded-full bg-muted text-2xl font-semibold transition-colors',
              isDisabled ? 'opacity-50' : 'hover:bg-accent active:bg-primary/10',
            )}
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => handlePress('0')}
          className={cn(
            'h-16 rounded-full bg-muted text-2xl font-semibold transition-colors',
            isDisabled ? 'opacity-50' : 'hover:bg-accent active:bg-primary/10',
          )}
        >
          0
        </button>
        <button
          type="button"
          disabled={isDisabled}
          onClick={handleBackspace}
          className={cn(
            'h-16 rounded-full flex items-center justify-center text-muted-foreground transition-colors',
            isDisabled ? 'opacity-50' : 'hover:bg-accent',
          )}
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';

import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import { Field } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FIELD_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground';

/**
 * Kirish — the sign-in gate.
 *
 * Master only ever authenticates Owner/Admin by username and password; a
 * PIN is a Waiter credential and Waiters sign into the order and mobile
 * apps, never this one, so there is no numeric PIN entry point here to put
 * a Keypad on. See the build report for how this was confirmed.
 *
 * No shell: this renders before AppShell exists, so it builds its own
 * centred surface on the same tokens rather than composing Screen.
 */
export function LoginPage() {
  const { setAuth, logoutMessage, clearLogoutMessage } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = 'Foydalanuvchi nomi kiritilishi shart';
    if (!password) errors.password = 'Parol kiritilishi shart';
    setFieldErrors(errors);
    if (errors.username || errors.password) return;

    setIsLoading(true);
    setError(null);
    clearLogoutMessage();
    try {
      const res = await authApi.login({ username, password });
      setAuth(res.token, res.user);
    } catch (err) {
      const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
      if (code === 'UNAUTHORIZED') setError("Foydalanuvchi nomi yoki parol noto'g'ri");
      else if (code === 'LOCKED') setError("Hisob bloklangan. Birozdan keyin qayta urinib ko'ring");
      else setError('Tizimga kirishda xatolik yuz berdi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-seam p-pad">
      <div className="grid w-full max-w-sm gap-seam">
        <Field tone="raised" className="text-center">
          <h1 className="text-[19px] font-semibold">Chayxana POS</h1>
        </Field>

        {error ? (
          <div className="bg-owed px-pad py-2.5 text-[13px] text-owed-foreground">{error}</div>
        ) : logoutMessage ? (
          <div className="bg-live px-pad py-2.5 text-[13px] text-live-foreground">{logoutMessage}</div>
        ) : null}

        <Field>
          <form onSubmit={onSubmit} className="flex flex-col gap-pad">
            <div className="grid gap-1">
              <label htmlFor="login-username" className={FIELD_LABEL}>
                Foydalanuvchi nomi
              </label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
              {fieldErrors.username ? <span className="text-[13px] text-owed">{fieldErrors.username}</span> : null}
            </div>

            <div className="grid gap-1">
              <label htmlFor="login-password" className={FIELD_LABEL}>
                Parol
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              {fieldErrors.password ? <span className="text-[13px] text-owed">{fieldErrors.password}</span> : null}
            </div>

            <Button type="submit" size="action" className="w-full" disabled={isLoading}>
              {isLoading ? 'Kirilmoqda…' : 'Kirish'}
            </Button>
          </form>
        </Field>
      </div>
    </div>
  );
}

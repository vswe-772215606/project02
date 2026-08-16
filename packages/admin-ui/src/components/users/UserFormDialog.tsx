import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Keypad, Seam, type KeypadKey } from '@/components/blocks';
import type { User } from '@/api/auth';

type Role = User['role'];

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Ega', ADMIN: 'Admin', WAITER: 'Ofitsiant' };

const TRIVIAL_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];

const FIELD_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground';

export type UserFormPayload = {
  fullName: string;
  role: Role;
  username?: string | null;
  password?: string;
  pin?: string;
};

/**
 * Create or edit a staff record.
 *
 * The PIN is entered on the same Keypad the till uses for tender and
 * quantity — the machine that runs this app has no keyboard, so a 4-digit
 * code has no business asking for one.
 */
export function UserFormDialog({
  open,
  user,
  currentUserRole,
  isSaving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  user: User | null;
  currentUserRole?: Role;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: UserFormPayload) => void;
}) {
  const isEdit = !!user;
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('WAITER');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(user?.fullName ?? '');
    setRole(user?.role ?? 'WAITER');
    setUsername(user?.username ?? '');
    setPassword('');
    setPin('');
    setError(null);
  }, [open, user]);

  // Owner is only offered as a target when the actor already is one, or the
  // record already is — an Admin editing an Owner must still see their role.
  const roleOptions = (['OWNER', 'ADMIN', 'WAITER'] as const).filter(
    (r) => r !== 'OWNER' || currentUserRole === 'OWNER' || user?.role === 'OWNER',
  );

  const onPinKey = (key: KeypadKey) => {
    if (key === 'backspace') {
      setPin((value) => value.slice(0, -1));
      return;
    }
    if (key === 'decimal') return;
    setPin((value) => (value.length >= 4 ? value : value + key));
  };

  const submit = () => {
    if (!fullName.trim()) {
      setError('FIO kiritilishi shart');
      return;
    }

    if (role === 'WAITER') {
      if (!isEdit && pin.length !== 4) {
        setError("PIN 4 ta raqamdan iborat bo'lishi kerak");
        return;
      }
      if (pin.length > 0 && pin.length !== 4) {
        setError("PIN 4 ta raqamdan iborat bo'lishi kerak");
        return;
      }
      if (pin.length === 4 && TRIVIAL_PINS.includes(pin)) {
        setError('PIN juda oddiy, boshqasini tanlang');
        return;
      }

      setError(null);
      onSave({
        fullName: fullName.trim(),
        role,
        ...(isEdit && user?.username ? { username: null } : {}),
        ...(pin.length === 4 ? { pin } : {}),
      });
      return;
    }

    if (!username.trim()) {
      setError('Foydalanuvchi nomi kiritilishi shart');
      return;
    }
    if (!isEdit && password.length < 4) {
      setError("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (password.length > 0 && password.length < 4) {
      setError("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
      return;
    }

    setError(null);
    onSave({
      fullName: fullName.trim(),
      role,
      username: username.trim(),
      ...(password.length > 0 ? { password } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-pad">
          <div className="grid gap-1">
            <label htmlFor="user-fullname" className={FIELD_LABEL}>
              To'liq ismi
            </label>
            <Input
              id="user-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masalan: Azizbek Karimov"
              autoFocus
            />
          </div>

          <div className="grid gap-1">
            <span className={FIELD_LABEL}>Rol</span>
            <Seam direction="row" columns={`repeat(${roleOptions.length}, 1fr)`}>
              {roleOptions.map((r) => (
                <Button key={r} type="button" variant={role === r ? 'default' : 'secondary'} onClick={() => setRole(r)}>
                  {ROLE_LABEL[r]}
                </Button>
              ))}
            </Seam>
          </div>

          {role === 'WAITER' ? (
            <div className="grid gap-1">
              <span className={FIELD_LABEL}>{isEdit ? 'PIN ni almashtirish (ixtiyoriy)' : 'PIN kod'}</span>
              <Seam columns="repeat(4, 1fr)">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex h-14 items-center justify-center bg-field text-[24px] font-semibold tabular-nums">
                    {pin[i] ?? ''}
                  </div>
                ))}
              </Seam>
              <Keypad onKey={onPinKey} className="w-full [&>*]:w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <label htmlFor="user-username" className={FIELD_LABEL}>
                  Foydalanuvchi nomi
                </label>
                <Input
                  id="user-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin123"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="user-password" className={FIELD_LABEL}>
                  {isEdit ? 'Parolni almashtirish (ixtiyoriy)' : 'Parol'}
                </label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? "Bo'sh qoldiring — o'zgarmaydi" : '••••••••'}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Bekor qilish
          </Button>
          <Button type="button" onClick={submit} disabled={isSaving}>
            {isSaving ? 'Saqlanmoqda…' : 'Saqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { User } from '../api/auth';
import { Modal } from './Modal';

/**
 * Shared schema for create + edit. On edit, password/PIN are optional
 * (only sent if the user wants to reset them). On create they're required
 * by role: WAITER needs a 4-digit PIN, OWNER/ADMIN need username + password.
 */
const buildSchema = (isEdit: boolean) =>
  z
    .object({
      fullName: z.string().min(1, "FIO kiritilishi shart"),
      role: z.enum(['OWNER', 'ADMIN', 'WAITER']),
      username: z.string().optional(),
      password: z.string().optional(),
      pin: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (data) => {
        if (data.role === 'WAITER') {
          // PIN: required on create, optional on edit (reset). If present, must be 4 digits.
          if (!isEdit && (!data.pin || data.pin.length !== 4 || !/^\d+$/.test(data.pin))) return false;
          if (data.pin && data.pin.length > 0 && (data.pin.length !== 4 || !/^\d+$/.test(data.pin))) return false;
          return true;
        }
        // OWNER / ADMIN: username always required, password required on create, optional on edit
        if (!data.username || data.username.length < 1) return false;
        if (!isEdit && (!data.password || data.password.length < 4)) return false;
        if (data.password && data.password.length > 0 && data.password.length < 4) return false;
        return true;
      },
      {
        message: "Foydalanuvchi nomi, parol yoki PIN noto'g'ri",
        path: ['username'],
      },
    );

export type UserFormValues = z.infer<ReturnType<typeof buildSchema>>;

const TRIVIAL_PINS = [
  '0000', '1111', '2222', '3333', '4444', '5555',
  '6666', '7777', '8888', '9999', '1234', '4321',
];

interface UserEditDialogProps {
  user: User | null;
  currentUserRole?: 'OWNER' | 'ADMIN' | 'WAITER';
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isSaving?: boolean;
}

export function UserEditDialog({ user, currentUserRole, onClose, onSave, isSaving }: UserEditDialogProps) {
  const isEdit = Boolean(user);
  const [showPass, setShowPass] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = buildSchema(isEdit);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          fullName: user.fullName,
          role: user.role,
          username: user.username ?? '',
          password: '',
          pin: '',
          isActive: user.isActive,
        }
      : { fullName: '', role: 'WAITER', username: '', password: '', pin: '', isActive: true },
  });

  const selectedRole = watch('role');
  const isActive = watch('isActive');

  const onSubmit = (data: UserFormValues) => {
    setFormError(null);
    if (data.role === 'WAITER' && data.pin && TRIVIAL_PINS.includes(data.pin)) {
      setFormError("PIN juda oddiy, boshqasini tanlang");
      return;
    }

    // Clean up payload depending on role + edit/create.
    const payload: Record<string, unknown> = {
      fullName: data.fullName,
      role: data.role,
    };

    if (data.role === 'WAITER') {
      if (data.pin && data.pin.length > 0) payload.pin = data.pin;
      // explicitly null out username on role change to WAITER from OWNER/ADMIN
      if (isEdit && user?.username) payload.username = null;
    } else {
      payload.username = data.username;
      if (data.password && data.password.length > 0) payload.password = data.password;
    }

    if (isEdit && typeof data.isActive === 'boolean') {
      payload.isActive = data.isActive;
    }

    onSave(payload);
  };

  return (
    <Modal title={isEdit ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">To'liq ismi (FIO)</label>
          <input
            {...register('fullName')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Masalan: Azizbek Karimov"
          />
          {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName.message as string}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
          <select
            {...register('role')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {currentUserRole === 'OWNER' && <option value="OWNER">Ega (Owner)</option>}
            <option value="ADMIN">Administrator</option>
            <option value="WAITER">Ofitsiant (Waiter)</option>
          </select>
        </div>

        {selectedRole !== 'WAITER' ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Foydalanuvchi nomi (Login)</label>
              <input
                {...register('username')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin123"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isEdit ? "Parolni almashtirish (ixtiyoriy)" : "Parol"}
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  {...register('password')}
                  className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={isEdit ? "Bo'sh qoldiring — o'zgarmaydi" : "••••••••"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isEdit ? "PIN ni almashtirish (ixtiyoriy, 4 raqam)" : "PIN kod (4 raqam)"}
            </label>
            <input
              type="text"
              maxLength={4}
              {...register('pin')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl font-bold tracking-widest"
              placeholder={isEdit ? "----" : "0000"}
              autoComplete="off"
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '');
              }}
            />
          </div>
        )}

        {isEdit && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
            <div>
              <div className="text-sm font-semibold text-slate-700">Holati</div>
              <div className="text-xs text-slate-500">{isActive ? 'Foydalanuvchi faol' : "To'xtatilgan — kira olmaydi"}</div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" {...register('isActive')} />
              <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-blue-300" />
              <span className="ml-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                {isActive ? 'Faol' : "To'xtatilgan"}
              </span>
            </label>
          </div>
        )}

        {errors.username && (
          <p className="text-xs text-red-500 font-medium">{(errors.username.message as string) || "Username/Parol yoki PIN talab qilinadi"}</p>
        )}
        {formError && <p className="text-xs text-red-600 font-semibold rounded-lg bg-red-50 px-3 py-2">{formError}</p>}

        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 disabled:opacity-60"
          >
            {isSaving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

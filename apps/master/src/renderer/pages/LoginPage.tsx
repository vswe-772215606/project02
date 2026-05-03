import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';

const loginSchema = z.object({
  username: z.string().min(1, "Foydalanuvchi nomi kiritilishi shart"),
  password: z.string().min(1, "Parol kiritilishi shart"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { setAuth, logoutMessage, clearLogoutMessage } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);
    clearLogoutMessage();
    try {
      const res = await authApi.login(data);
      setAuth(res.token, res.user);
    } catch (err: any) {
      if (err.code === 'UNAUTHORIZED') {
        setError("Foydalanuvchi nomi yoki parol noto'g'ri");
      } else if (err.code === 'LOCKED') {
        setError("Hisob bloklangan. Birozdan keyin qayta urinib ko'ring");
      } else {
        setError("Tizimga kirishda xatolik yuz berdi");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-8">
          Chayxana POS
        </h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}
        {!error && logoutMessage && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded mb-6 text-sm">
            {logoutMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Foydalanuvchi nomi
            </label>
            <input
              {...register('username')}
              type="text"
              className={`w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                errors.username ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
              placeholder="admin"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Parol
            </label>
            <input
              {...register('password')}
              type="password"
              className={`w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                errors.password ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all shadow-sm"
          >
            {isLoading ? 'Kirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

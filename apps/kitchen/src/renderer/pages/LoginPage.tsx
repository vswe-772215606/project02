import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { authApi } from '../api/auth';
import { ChefHat, Lock, User, Settings } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(1, 'Foydalanuvchi nomi kiritilmadi'),
  password: z.string().min(1, 'Parol kiritilmadi'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      const res = await authApi.login(data.username, data.password);
      login(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Kirishda xatolik yuz berdi');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-blue-600 p-8 text-center text-white relative">
          <div className="inline-flex p-4 bg-white/20 rounded-2xl mb-4">
            <ChefHat size={48} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Oshxona</h1>
          <p className="text-blue-100 font-medium mt-1">Tizimga kirish</p>
          <p className="text-blue-200 text-xs mt-1 font-mono">{serverUrl}</p>
          <button
            type="button"
            onClick={() => setServerUrl('')}
            className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
            title="Server manzilini o'zgartirish"
          >
            <Settings size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-bold animate-in shake duration-300">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase ml-1">Foydalanuvchi nomi</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  {...register('username')}
                  type="text"
                  className={`w-full h-16 pl-12 pr-4 bg-slate-50 border-2 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all text-lg font-bold ${
                    errors.username ? 'border-red-300' : 'border-slate-100 focus:border-blue-500'
                  }`}
                  placeholder="admin"
                />
              </div>
              {errors.username && <p className="text-xs font-bold text-red-500 ml-1">{errors.username.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700 uppercase ml-1">Parol</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  {...register('password')}
                  type="password"
                  className={`w-full h-16 pl-12 pr-4 bg-slate-50 border-2 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all text-lg font-bold ${
                    errors.password ? 'border-red-300' : 'border-slate-100 focus:border-blue-500'
                  }`}
                  placeholder="••••••••"
                />
              </div>
              {errors.password && <p className="text-xs font-bold text-red-500 ml-1">{errors.password.message}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-16 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl text-xl font-black uppercase tracking-wide shadow-lg shadow-blue-200 transition-all active:scale-[0.98] mt-4 flex items-center justify-center space-x-2"
          >
            {isSubmitting ? 'Kirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

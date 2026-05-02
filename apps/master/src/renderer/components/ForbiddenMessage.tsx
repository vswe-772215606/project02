import React from 'react';
import { ShieldAlert } from 'lucide-react';

export function ForbiddenMessage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-4 bg-red-50 text-red-500 rounded-full">
        <ShieldAlert size={48} />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-800">Ruxsat yo'q</h2>
        <p className="text-slate-500 max-w-sm mx-auto">
          Sizda bu sahifani ko'rish uchun ruxsat yo'q. Faqat egasi (Owner) bu sahifani ko'ra oladi.
        </p>
      </div>
    </div>
  );
}

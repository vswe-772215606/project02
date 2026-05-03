import React from 'react';
import { useConnectionStore } from '../stores/connection.store';
import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === 'online') return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white h-12 flex items-center justify-center space-x-3 shadow-lg animate-in slide-in-from-top duration-300">
      <WifiOff size={20} />
      <span className="font-black uppercase tracking-widest text-sm">Server bilan aloqa uzildi!</span>
    </div>
  );
}

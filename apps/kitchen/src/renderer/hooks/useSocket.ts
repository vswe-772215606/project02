import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { getMasterUrl } from '../lib/env';
import { useSettingsStore } from '../stores/settings.store';

let socket: Socket | null = null;

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 200);
  } catch (err) {
    console.warn('Audio beep failed:', err);
  }
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    socket = io(getMasterUrl(), {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));

    socket.on('ticket:new', () => {
      qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] });
      beep();
    });
    socket.on('ticket:statusChanged', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('ticket:noteEdited', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('ticket:canceled', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('order:transferred', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('menu:itemAvailability', () => qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('stock:changed', () => qc.invalidateQueries({ queryKey: ['stock'] }));

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, serverUrl, qc, setStatus]);
}

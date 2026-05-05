import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { checkServerHealth } from '../lib/network';
import { useMasterUrl } from '../providers/MasterUrlProvider';

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
  const logout = useAuthStore((s) => s.logout);
  const { masterUrl } = useMasterUrl();
  const setStatus = useConnectionStore((s) => s.setStatus);
  const markOnline = useConnectionStore((s) => s.markOnline);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token || !masterUrl) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    let authFailed = false;
    let failedAttempts = 0;
    setStatus('connecting');

    const failAuth = () => {
      authFailed = true;
      setStatus('auth-failed');
      logout();
      socket?.disconnect();
      socket = null;
    };

    socket = io(masterUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      failedAttempts = 0;
      markOnline();
    });
    socket.on('disconnect', () => {
      if (!authFailed) {
        setStatus('reconnecting');
      }
    });
    socket.on('auth:kicked', () => {
      failAuth();
    });
    socket.on('connect_error', (error) => {
      if (error.message.includes('UNAUTHORIZED')) {
        failAuth();
        return;
      }

      failedAttempts += 1;
      if (failedAttempts < 5) {
        setStatus('reconnecting');
        return;
      }

      void checkServerHealth(masterUrl, 3000)
        .then(() => {
          if (!authFailed) {
            setStatus('reconnecting');
          }
        })
        .catch(() => {
          if (!authFailed) {
            setStatus('unreachable');
          }
        });
    });

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
      authFailed = true;
      socket?.disconnect();
      socket = null;
    };
  }, [logout, markOnline, masterUrl, qc, setStatus, token]);
}

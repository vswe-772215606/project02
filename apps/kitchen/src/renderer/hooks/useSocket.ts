import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { MASTER_URL } from '../lib/env';

let socket: Socket | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);
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

    socket = io(MASTER_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));

    socket.on('ticket:new', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
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
  }, [token, qc, setStatus]);
}

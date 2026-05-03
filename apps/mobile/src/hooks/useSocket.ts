import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { fireReadyNotification } from '../lib/notifications';
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

    socket.on('ticket:new', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('ticket:statusChanged', ({ status }: { ticketId: string; status: string }) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (status === 'READY') {
        void fireReadyNotification();
      }
    });
    socket.on('ticket:canceled', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:approved', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:closed', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:walkout', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:transferred', () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    });
    socket.on('menu:changed', () => void qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('menu:itemAvailability', () => void qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('stock:changed', () => void qc.invalidateQueries({ queryKey: ['menu'] }));

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, qc, setStatus]);

}

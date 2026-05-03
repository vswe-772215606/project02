import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const qc = useQueryClient();
  const queryClientRef = useRef(qc);
  const setStatusRef = useRef(setStatus);

  queryClientRef.current = qc;
  setStatusRef.current = setStatus;

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        socket = null;
        socketToken = null;
      }
      return;
    }

    if (socket && socketToken === token) {
      if (!socket.connected) {
        setStatusRef.current('connecting');
        socket.connect();
      }
      return;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    setStatusRef.current('connecting');

    const nextSocket = io('http://localhost:4000', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });
    socket = nextSocket;
    socketToken = token;

    nextSocket.on('connect', () => setStatusRef.current('online'));
    nextSocket.on('disconnect', () => setStatusRef.current('offline'));
    nextSocket.on('connect_error', () => setStatusRef.current('offline'));

    // Generic invalidation strategy: any event re-fetches relevant queries.
    nextSocket.on('order:billRequested', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('order:updated', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('order:approved', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('order:closed', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('order:walkout', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('order:transferred', () => queryClientRef.current.invalidateQueries({ queryKey: ['orders'] }));
    nextSocket.on('ticket:new', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['kitchen', 'tickets'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });
    nextSocket.on('ticket:statusChanged', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['kitchen', 'tickets'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });
    nextSocket.on('ticket:noteEdited', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['kitchen', 'tickets'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });
    nextSocket.on('ticket:canceled', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['kitchen', 'tickets'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });
    nextSocket.on('menu:itemAvailability', () => queryClientRef.current.invalidateQueries({ queryKey: ['menu'] }));
    nextSocket.on('stock:changed', () => queryClientRef.current.invalidateQueries({ queryKey: ['stock'] }));

    return () => {
      if (socket === nextSocket) {
        nextSocket.disconnect();
        socket = null;
        socketToken = null;
      }
    };
  }, [token]);
}

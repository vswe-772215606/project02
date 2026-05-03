import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import {
  connectSocketClient,
  disconnectSocketClient,
  getSocketClient,
  hasSocketClientForToken,
  reconnectSocketClient,
} from '../lib/socket-client';

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const forceLogout = useAuthStore((s) => s.forceLogout);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const qc = useQueryClient();
  const queryClientRef = useRef(qc);
  const setStatusRef = useRef(setStatus);
  const forceLogoutRef = useRef(forceLogout);

  queryClientRef.current = qc;
  setStatusRef.current = setStatus;
  forceLogoutRef.current = forceLogout;

  useEffect(() => {
    if (!token) {
      disconnectSocketClient();
      return;
    }

    if (hasSocketClientForToken(token)) {
      const currentSocket = getSocketClient();
      if (currentSocket && !currentSocket.connected) {
        setStatusRef.current('reconnecting');
        reconnectSocketClient();
      }
      return;
    }

    setStatusRef.current('connecting');
    const nextSocket = connectSocketClient(token);

    nextSocket.on('connect', () => setStatusRef.current('online'));
    nextSocket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        return;
      }
      if (reason === 'io server disconnect') {
        return;
      }
      setStatusRef.current('reconnecting');
    });
    nextSocket.on('connect_error', (error) => {
      if (error.message === 'UNAUTHORIZED') {
        setStatusRef.current('auth-failed');
        forceLogoutRef.current("Sessiya tugadi. Iltimos qaytadan kiring.");
        return;
      }
      setStatusRef.current('reconnecting');
    });
    nextSocket.on('auth:kicked', (payload?: { message?: string }) => {
      setStatusRef.current('auth-failed');
      forceLogoutRef.current(payload?.message ?? "Sessiya tugadi. Iltimos qaytadan kiring.");
    });

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
      if (getSocketClient() === nextSocket) {
        disconnectSocketClient();
      }
    };
  }, [token]);
}

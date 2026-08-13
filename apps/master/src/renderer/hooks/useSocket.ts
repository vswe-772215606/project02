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
    //
    // Order events also refresh the floor: occupancy is derived from whether a
    // table has an open order, and under the current layout the floor grid is
    // the live-state display rather than a badge on a settings page, so a
    // stale tile misrepresents the room.
    const orderChanged = () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['tables'] });
    };
    nextSocket.on('order:updated', orderChanged);
    nextSocket.on('order:closed', orderChanged);
    nextSocket.on('order:walkout', orderChanged);
    nextSocket.on('order:canceled', orderChanged);
    nextSocket.on('order:transferred', orderChanged);
    nextSocket.on('menu:itemAvailability', () => queryClientRef.current.invalidateQueries({ queryKey: ['menu'] }));
    nextSocket.on('stock:changed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['stock'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['menu'] });
    });
    nextSocket.on('menu:changed', () => queryClientRef.current.invalidateQueries({ queryKey: ['menu'] }));

    return () => {
      if (getSocketClient() === nextSocket) {
        disconnectSocketClient();
      }
    };
  }, [token]);
}

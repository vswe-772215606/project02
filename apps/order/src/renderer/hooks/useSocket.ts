import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { useToastStore } from '../stores/toast.store';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { checkServerHealth } from '../lib/network';
import {
  connectSocketClient,
  disconnectSocketClient,
  getSocketClient,
  hasSocketClientForToken,
  reconnectSocketClient,
} from '../lib/socket-client';

export function useSocket(): void {
  const token = useAuthStore((s) => s.token);
  const forceLogout = useAuthStore((s) => s.forceLogout);
  const { masterUrl } = useMasterUrl();
  const setStatus = useConnectionStore((s) => s.setStatus);
  const markOnline = useConnectionStore((s) => s.markOnline);
  const showToast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const queryClientRef = useRef(qc);
  const setStatusRef = useRef(setStatus);
  const markOnlineRef = useRef(markOnline);
  const forceLogoutRef = useRef(forceLogout);
  const showToastRef = useRef(showToast);
  const masterUrlRef = useRef<string | null>(masterUrl);

  queryClientRef.current = qc;
  setStatusRef.current = setStatus;
  markOnlineRef.current = markOnline;
  forceLogoutRef.current = forceLogout;
  showToastRef.current = showToast;
  masterUrlRef.current = masterUrl;

  useEffect(() => {
    if (!token || !masterUrl) {
      disconnectSocketClient();
      return;
    }

    if (hasSocketClientForToken(token, masterUrl)) {
      const current = getSocketClient();
      if (current && !current.connected) {
        setStatusRef.current('reconnecting');
        reconnectSocketClient();
      }
      return;
    }

    let authFailed = false;
    let failedAttempts = 0;
    setStatusRef.current('connecting');
    const nextSocket = connectSocketClient(token, masterUrl);

    const failAuth = (message?: string) => {
      authFailed = true;
      setStatusRef.current('auth-failed');
      forceLogoutRef.current(message ?? 'Sessiya tugadi. Iltimos qaytadan kiring.');
    };

    nextSocket.on('connect', () => {
      failedAttempts = 0;
      markOnlineRef.current();
    });

    nextSocket.on('disconnect', (reason) => {
      if (authFailed) return;
      if (reason === 'io client disconnect') return;
      setStatusRef.current('reconnecting');
    });

    nextSocket.on('connect_error', (error) => {
      if (authFailed) return;
      if (error.message === 'UNAUTHORIZED' || error.message.includes('UNAUTHORIZED')) {
        failAuth();
        return;
      }

      failedAttempts += 1;
      if (failedAttempts < 5) {
        setStatusRef.current('reconnecting');
        return;
      }

      const url = masterUrlRef.current;
      if (!url) {
        setStatusRef.current('unreachable');
        return;
      }

      void checkServerHealth(url, 3000)
        .then(() => {
          if (!authFailed) setStatusRef.current('reconnecting');
        })
        .catch(() => {
          if (!authFailed) setStatusRef.current('unreachable');
        });
    });

    nextSocket.on('auth:kicked', (payload?: { message?: string }) => {
      failAuth(payload?.message);
    });

    nextSocket.on('connection:closed', () => {
      setStatusRef.current('reconnecting');
    });

    // Order events — re-fetch order data on any change.
    nextSocket.on('order:updated', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });
    nextSocket.on('order:closed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      showToastRef.current('Buyurtma yopildi', 'success');
    });
    nextSocket.on('order:walkout', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      showToastRef.current("Buyurtma to'lovsiz yopildi", 'warning');
    });
    nextSocket.on('order:transferred', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['tables'] });
    });

    // Menu / stock — invalidate so item availability and yield refresh.
    nextSocket.on('menu:itemAvailability', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['menu'] });
    });
    nextSocket.on('menu:changed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['menu'] });
    });
    nextSocket.on('ingredient:stockChanged', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['menu'] });
    });

    return () => {
      if (getSocketClient() === nextSocket) {
        disconnectSocketClient();
      }
    };
  }, [token, masterUrl]);
}

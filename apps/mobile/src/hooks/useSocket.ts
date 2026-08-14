import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { checkServerHealth } from '../lib/network';
import { getMasterUrl } from '../lib/env';
import { useSettingsStore } from '../stores/settings.store';

let socket: Socket | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const markOnline = useConnectionStore((s) => s.markOnline);
  const qc = useQueryClient();

  useEffect(() => {
    const masterUrl = getMasterUrl();

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
      void clearAuth();
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

    socket.on('order:closed', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:transferred', () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    });
    socket.on('menu:changed', () => void qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('menu:itemAvailability', () => void qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('ingredient:stockChanged', () => void qc.invalidateQueries({ queryKey: ['menu'] }));

    return () => {
      authFailed = true;
      socket?.disconnect();
      socket = null;
    };
  }, [clearAuth, markOnline, qc, serverUrl, setStatus, token]);

}

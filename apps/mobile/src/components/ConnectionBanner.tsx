import React from 'react';
import { useConnectionStore } from '../stores/connection.store';
import { Text, View } from 'react-native';
import { getMasterUrl } from '../lib/env';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const masterUrl = getMasterUrl();

  if (status === 'online') return null;

  const backgroundColor = status === 'connecting'
    ? '#fbbf24'
    : status === 'reconnecting'
      ? '#f97316'
      : '#dc2626';
  const message = status === 'connecting'
    ? "Aloqa o'rnatilmoqda..."
    : status === 'reconnecting'
      ? 'Qayta ulanmoqda...'
      : status === 'auth-failed'
        ? 'Sessiya tugadi. Qaytadan kiring.'
        : `Server topilmadi: ${masterUrl ?? 'server tanlanmagan'}`;

  return (
    <View style={{
      backgroundColor,
      padding: 8,
    }}>
      <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
        {message}
      </Text>
    </View>
  );
}

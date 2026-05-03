import React from 'react';
import { useConnectionStore } from '../stores/connection.store';
import { Text, View } from 'react-native';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  
  if (status === 'online') return null;
  
  return (
    <View style={{
      backgroundColor: status === 'offline' ? '#dc2626' : '#f59e0b',
      padding: 8,
    }}>
      <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
        {status === 'offline' ? 'Aloqada uzilish' : 'Ulanmoqda...'}
      </Text>
    </View>
  );
}

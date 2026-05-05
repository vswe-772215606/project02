import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getMasterUrl } from '../lib/env';
import { useConnectionStore } from '../stores/connection.store';

function getDotColor(status: string): string {
  switch (status) {
    case 'online':
      return '#22c55e';
    case 'connecting':
      return '#fbbf24';
    case 'reconnecting':
      return '#f97316';
    case 'auth-failed':
      return '#f43f5e';
    case 'unreachable':
      return '#dc2626';
    default:
      return '#94a3b8';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'online':
      return 'onlayn';
    case 'connecting':
      return 'ulanmoqda';
    case 'reconnecting':
      return 'qayta ulanmoqda';
    case 'auth-failed':
      return 'sessiya tugagan';
    case 'unreachable':
      return 'server topilmadi';
    default:
      return status;
  }
}

export function ConnectionDiagnostics() {
  const status = useConnectionStore((s) => s.status);
  const masterUrl = getMasterUrl();

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: getDotColor(status) }]} />
          <Text style={styles.label}>{getStatusLabel(status)}</Text>
        </View>
        <Text style={styles.url} numberOfLines={2}>
          {masterUrl ?? 'Server tanlanmagan'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 40,
  },
  card: {
    maxWidth: 220,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  url: {
    marginTop: 6,
    color: '#334155',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});

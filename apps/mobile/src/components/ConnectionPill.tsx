import { StyleSheet, Text, View } from 'react-native';
import { Wifi, WifiOff } from 'lucide-react-native';
import { useConnectionStore } from '../stores/connection.store';
import { theme } from '../lib/theme';

/**
 * Compact status pill for use in screen headers. Reads from the connection
 * store so it stays in sync with whatever the socket / health check reports.
 */
export function ConnectionPill() {
  const status = useConnectionStore((s) => s.status);

  if (status === 'online') {
    return (
      <View style={[styles.pill, styles.online]}>
        <Wifi size={12} color={theme.colors.success} strokeWidth={2.5} />
        <Text style={[styles.label, { color: theme.colors.success }]}>Onlayn</Text>
      </View>
    );
  }

  if (status === 'auth-failed') {
    return (
      <View style={[styles.pill, styles.danger]}>
        <WifiOff size={12} color={theme.colors.danger} strokeWidth={2.5} />
        <Text style={[styles.label, { color: theme.colors.danger }]}>Sessiya tugagan</Text>
      </View>
    );
  }

  if (status === 'unreachable') {
    return (
      <View style={[styles.pill, styles.danger]}>
        <WifiOff size={12} color={theme.colors.danger} strokeWidth={2.5} />
        <Text style={[styles.label, { color: theme.colors.danger }]}>Aloqa yo'q</Text>
      </View>
    );
  }

  // connecting or reconnecting
  return (
    <View style={[styles.pill, styles.warning]}>
      <WifiOff size={12} color={theme.colors.warning} strokeWidth={2.5} />
      <Text style={[styles.label, { color: theme.colors.warning }]}>
        {status === 'connecting' ? 'Ulanmoqda…' : 'Qayta ulanmoqda'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  online: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success + '40',
  },
  warning: {
    backgroundColor: theme.colors.warningLight,
    borderColor: theme.colors.warning + '40',
  },
  danger: {
    backgroundColor: theme.colors.dangerLight,
    borderColor: theme.colors.danger + '40',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});

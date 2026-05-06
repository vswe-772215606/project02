import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useToastStore } from '../stores/toast.store';
import { theme } from '../lib/theme';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <TouchableOpacity
          key={toast.id}
          style={[
            styles.toast,
            toast.type === 'success' && styles.success,
            toast.type === 'warning' && styles.warning,
            toast.type === 'error' && styles.error,
          ]}
          onPress={() => dismiss(toast.id)}
          activeOpacity={0.9}
        >
          <Text style={styles.text}>{toast.message}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 24,
    right: 24,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    backgroundColor: theme.colors.slate[800],
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    ...theme.shadows.md,
  },
  success: { backgroundColor: theme.colors.success },
  warning: { backgroundColor: theme.colors.warning },
  error: { backgroundColor: theme.colors.danger },
  text: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

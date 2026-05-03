import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useToastStore } from '../stores/toast.store';

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
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  success: { backgroundColor: '#15803d' },
  warning: { backgroundColor: '#b45309' },
  error: { backgroundColor: '#b91c1c' },
  text: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

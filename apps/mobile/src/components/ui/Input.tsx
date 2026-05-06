import React from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, TextStyle, TextInputProps } from 'react-native';
import { theme } from '../../lib/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export function Input({
  label,
  error,
  containerStyle,
  inputStyle,
  ...props
}: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          error ? styles.inputError : null,
          inputStyle,
        ]}
        placeholderTextColor={theme.colors.slate[400]}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.slate[700],
    marginBottom: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.slate[200],
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.slate[900],
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
});

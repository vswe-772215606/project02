import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../lib/theme';

interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'slate';
  outline?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({
  label,
  variant = 'primary',
  outline = false,
  style,
  textStyle,
}: BadgeProps) {
  const getVariantStyle = () => {
    const color = (theme.colors as any)[variant];
    const stringColor = typeof color === 'string' ? color : theme.colors.slate[500];

    if (outline) {
      return {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: stringColor,
      };
    }
    return {
      backgroundColor: (theme.colors as any)[`${variant}Light`] || theme.colors.slate[100],
    };
  };

  const getTextStyle = () => {
    const color = (theme.colors as any)[variant];
    const stringColor = typeof color === 'string' ? color : theme.colors.slate[600];
    return {
      color: stringColor,
    };
  };

  return (
    <View style={[styles.base, getVariantStyle() as ViewStyle, style]}>
      <Text style={[styles.text, getTextStyle() as TextStyle, textStyle]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

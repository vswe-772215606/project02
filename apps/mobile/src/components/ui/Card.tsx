import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp } from 'react-native';
import { theme } from '../../lib/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'elevated' | 'outlined' | 'flat';
}

export function Card({
  children,
  style,
  onPress,
  variant = 'elevated',
}: CardProps) {
  const Container = onPress ? Pressable : View;

  const getVariantStyle = () => {
    switch (variant) {
      case 'outlined':
        return styles.outlined;
      case 'flat':
        return styles.flat;
      default:
        return styles.elevated;
    }
  };

  return (
    <Container
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.base,
        getVariantStyle(),
        style,
        onPress && pressed && styles.pressed,
      ]}
    >
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  elevated: {
    ...theme.shadows.sm,
  },
  outlined: {
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
  },
  flat: {
    backgroundColor: theme.colors.slate[50],
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});

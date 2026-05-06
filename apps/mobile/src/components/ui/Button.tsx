import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../lib/theme';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'info';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.secondary;
      case 'danger':
        return styles.danger;
      case 'outline':
        return styles.outline;
      case 'ghost':
        return styles.ghost;
      case 'info':
        return styles.info;
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'outline':
        return styles.outlineText;
      case 'ghost':
        return styles.ghostText;
      case 'secondary':
        return styles.secondaryText;
      default:
        return styles.primaryText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return styles.sm;
      case 'lg':
        return styles.lg;
      default:
        return styles.md;
    }
  };

  const getTextSizeStyle = () => {
    switch (size) {
      case 'sm':
        return styles.smText;
      case 'lg':
        return styles.lgText;
      default:
        return styles.mdText;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        getVariantStyle(),
        getSizeStyle(),
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? theme.colors.primary : theme.colors.white} />
      ) : (
        <Text style={[styles.baseText, getTextStyle(), getTextSizeStyle(), textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.slate[100],
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
  info: {
    backgroundColor: theme.colors.info,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  sm: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  md: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  lg: {
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.lg,
  },
  baseText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryText: {
    color: theme.colors.white,
  },
  secondaryText: {
    color: theme.colors.slate[800],
  },
  outlineText: {
    color: theme.colors.primary,
  },
  ghostText: {
    color: theme.colors.primary,
  },
  smText: {
    fontSize: 14,
  },
  mdText: {
    fontSize: 16,
  },
  lgText: {
    fontSize: 18,
  },
  disabled: {
    opacity: 0.5,
  },
});

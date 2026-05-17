import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  size?: 'md' | 'lg';
  style?: ViewStyle;
};

function toneAccent(tone: Tone) {
  switch (tone) {
    case 'primary':
      return { fg: theme.colors.primary, bg: theme.colors.primaryLight };
    case 'success':
      return { fg: theme.colors.success, bg: theme.colors.successLight };
    case 'warning':
      return { fg: theme.colors.warning, bg: theme.colors.warningLight };
    case 'danger':
      return { fg: theme.colors.danger, bg: theme.colors.dangerLight };
    default:
      return { fg: theme.colors.slate[900], bg: theme.colors.white };
  }
}

export function StatTile({ label, value, hint, tone = 'neutral', size = 'md', style }: Props) {
  const accent = toneAccent(tone);
  return (
    <View style={[styles.tile, { backgroundColor: accent.bg }, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          size === 'lg' && styles.valueLg,
          { color: accent.fg },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint != null && (
        typeof hint === 'string'
          ? <Text style={styles.hint}>{hint}</Text>
          : <View>{hint}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  valueLg: {
    fontSize: 32,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.slate[500],
  },
});

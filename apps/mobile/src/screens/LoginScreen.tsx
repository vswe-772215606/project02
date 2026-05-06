import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export function LoginScreen() {
  const nav = useNavigation<Nav>();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const flashAnim = useRef(new Animated.Value(1)).current;

  const triggerFlash = useCallback(() => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0.2, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0.2, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [flashAnim]);

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  // Live lockout countdown
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const diff = lockedUntil.getTime() - Date.now();
      if (diff <= 0) {
        setLockedUntil(null);
        setCountdown('');
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const doLogin = useCallback(async (pinValue: string) => {
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await authApi.loginPin(pinValue);
      await setAuth(token, user);
    } catch (err: any) {
      if (err.code === 'LOCKED') {
        const until = err.details?.until
          ? new Date(err.details.until)
          : new Date(Date.now() + 5 * 60 * 1000);
        setLockedUntil(until);
      } else {
        setError("Noto'g'ri PIN");
        triggerFlash();
      }
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [setAuth, triggerFlash]);

  // Auto-submit on 4th digit
  useEffect(() => {
    if (pin.length === 4 && !loading && !lockedUntil) {
      void doLogin(pin);
    }
  }, [pin, loading, lockedUntil, doLogin]);

  const isDisabled = loading || !!lockedUntil;

  const handlePress = (digit: string) => {
    if (isDisabled || pin.length >= 4) return;
    setError(null);
    setPin(prev => prev + digit);
  };

  const handleBackspace = () => {
    if (isDisabled) return;
    setError(null);
    setPin(prev => prev.slice(0, -1));
  };

  const renderDigit = (digit: string) => (
    <TouchableOpacity
      key={digit}
      style={[styles.digitButton, isDisabled && styles.digitButtonDisabled]}
      onPress={() => handlePress(digit)}
      disabled={isDisabled}
    >
      <Text style={[styles.digitText, isDisabled && styles.digitTextDisabled]}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.settingsBtn}>
        <MaterialCommunityIcons name="cog-outline" size={24} color={theme.colors.slate[600]} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Chayxana</Text>
        <Text style={styles.subtitle}>PIN kodni kiriting</Text>
      </View>

      <Animated.View style={[styles.dotsContainer, { opacity: flashAnim }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              pin.length > i && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.messageArea}>
        {lockedUntil ? (
          <View style={styles.lockedContainer}>
            <Text style={styles.lockedText}>Hisob bloklangan</Text>
            <Text style={styles.countdownText}>Qayta urinish: {countdown}</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
        {loading && (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        )}
      </View>

      <View style={styles.pad}>
        <View style={styles.row}>
          {[1, 2, 3].map(d => renderDigit(d.toString()))}
        </View>
        <View style={styles.row}>
          {[4, 5, 6].map(d => renderDigit(d.toString()))}
        </View>
        <View style={styles.row}>
          {[7, 8, 9].map(d => renderDigit(d.toString()))}
        </View>
        <View style={styles.row}>
          <View style={styles.digitButtonPlaceholder} />
          {renderDigit('0')}
          <TouchableOpacity
            style={[styles.digitButton, styles.backspaceButton, isDisabled && styles.digitButtonDisabled]}
            onPress={handleBackspace}
            disabled={isDisabled}
          >
            <MaterialCommunityIcons 
              name="backspace-outline" 
              size={28} 
              color={isDisabled ? theme.colors.slate[300] : theme.colors.slate[600]} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.xl,
  },
  settingsBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.slate[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: { fontSize: 20, color: theme.colors.slate[600] },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.caption,
    fontSize: 16,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xl,
    gap: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  dotFilled: {
    backgroundColor: theme.colors.primary,
  },
  dotError: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.danger,
  },
  messageArea: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  lockedContainer: {
    alignItems: 'center',
  },
  lockedText: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  countdownText: {
    color: theme.colors.slate[500],
    fontSize: 14,
    marginTop: 4,
  },
  pad: {
    width: '100%',
    maxWidth: 320,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  digitButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.slate[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitButtonPlaceholder: {
    width: 76,
    height: 76,
  },
  backspaceButton: {
    backgroundColor: 'transparent',
  },
  digitButtonDisabled: {
    backgroundColor: theme.colors.slate[50],
  },
  digitText: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.colors.slate[900],
  },
  backspaceText: {
    color: theme.colors.slate[400],
  },
  digitTextDisabled: {
    color: theme.colors.slate[300],
  },
});

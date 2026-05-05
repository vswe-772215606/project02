import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';
import { RootStackParamList } from '../navigation/AppNavigator';

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
        <Text style={styles.settingsBtnText}>⚙</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Chayxana</Text>
      <Text style={styles.subtitle}>PIN kodni kiriting</Text>

      <Animated.View style={[styles.dotsContainer, { opacity: flashAnim }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </Animated.View>

      <View style={styles.messageArea}>
        {lockedUntil ? (
          <Text style={styles.lockedText}>
            Hisob bloklangan.{'\n'}Yana kirish: {countdown}
          </Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
        {loading && (
          <ActivityIndicator size="small" color="#3b82f6" />
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
          <TouchableOpacity
            style={[styles.digitButton, isDisabled && styles.digitButtonDisabled]}
            onPress={handleBackspace}
            disabled={isDisabled}
          >
            <Text style={[styles.digitText, isDisabled && styles.digitTextDisabled]}>⌫</Text>
          </TouchableOpacity>
          {renderDigit('0')}
          <View style={styles.digitButton} />
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
    backgroundColor: '#fff',
    padding: 20,
  },
  settingsBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: { fontSize: 18, color: '#64748b' },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 20,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  dotFilled: {
    backgroundColor: '#3b82f6',
  },
  messageArea: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  lockedText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  pad: {
    width: '100%',
    maxWidth: 320,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  digitButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  digitText: {
    fontSize: 28,
    fontWeight: '600',
  },
  digitTextDisabled: {
    color: '#9ca3af',
  },
});

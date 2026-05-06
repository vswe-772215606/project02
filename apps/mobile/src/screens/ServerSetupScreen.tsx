import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSettingsStore } from '../stores/settings.store';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { theme } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

export function ServerSetupScreen() {
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    const url = normalizeUrl(input);
    if (!url) {
      setError('Server manzilini kiriting');
      return;
    }
    setError('');
    setTesting(true);
    try {
      await checkServerHealth(url);
      setServerUrl(url);
    } catch (error) {
      setError(
        `Ulanib bo'lmadi: ${url}\nServer yoqilganligini va IP to'g'riligini tekshiring.\nXatolik: ${getErrorMessage(error)}`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.logo}>Chayxana</Text>
          <Text style={styles.title}>Server sozlamalari</Text>
          <Text style={styles.desc}>
            Ilovani ishlatish uchun Master kompyuterga ulanish kerak.
            Master kompyuterning IP manzilini kiriting.
          </Text>

          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>Qanday topish mumkin?</Text>
            <Text style={styles.instructionText}>
              1. Master kompyuterda "Sozlamalar" sahifasiga o'ting.{"\n"}
              2. "Tizim ma'lumotlari" bo'limida IP manzilni ko'rasiz.{"\n"}
              3. Masalan: <Text style={styles.example}>192.168.1.50</Text>
            </Text>
          </View>

          <Input
            label="IP manzil yoki URL"
            placeholder="192.168.1.50"
            value={input}
            onChangeText={(t) => {
              setInput(t);
              setError('');
            }}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleConnect}
            containerStyle={styles.inputContainer}
          />

          <Button
            title={testing ? "Ulanmoqda..." : "Ulanish"}
            onPress={handleConnect}
            loading={testing}
            style={styles.btn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.slate[50],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.white,
  },
  logo: {
    ...theme.typography.h1,
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.slate[800],
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  desc: {
    ...theme.typography.caption,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  instructionCard: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  instructionText: {
    fontSize: 13,
    color: theme.colors.slate[700],
    lineHeight: 18,
  },
  example: {
    fontWeight: '800',
    color: theme.colors.black,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  btn: {
    marginTop: theme.spacing.sm,
  },
});

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSettingsStore } from '../stores/settings.store';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';

export function ServerSetupScreen() {
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    const url = normalizeUrl(input);
    if (!url) { setError('Server manzilini kiriting'); return; }
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
      <View style={styles.card}>
        <Text style={styles.logo}>Chayxana</Text>
        <Text style={styles.title}>Server manzili</Text>
        <Text style={styles.desc}>
          Master kompyuterning IP manzilini kiriting.{'\n'}
          Masalan: <Text style={styles.example}>192.168.1.50</Text>
        </Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="192.168.1.50"
          placeholderTextColor="#9ca3af"
          value={input}
          onChangeText={(t) => { setInput(t); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleConnect}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, testing && styles.btnBusy]}
          onPress={handleConnect}
          disabled={testing}
          activeOpacity={0.8}
        >
          {testing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Ulash</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#f3f4f6',
    justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 28, shadowColor: '#000',
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  logo: {
    fontSize: 28, fontWeight: '800', color: '#1d4ed8',
    textAlign: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 19, fontWeight: '700', color: '#111827',
    textAlign: 'center', marginBottom: 8,
  },
  desc: {
    fontSize: 14, color: '#6b7280', textAlign: 'center',
    lineHeight: 20, marginBottom: 24,
  },
  example: { color: '#374151', fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 16, color: '#111827', marginBottom: 12,
  },
  inputError: { borderColor: '#ef4444' },
  errorText: {
    color: '#dc2626', fontSize: 13, lineHeight: 18,
    marginBottom: 12, textAlign: 'center',
  },
  btn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  btnBusy: { backgroundColor: '#93c5fd' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore, VibrateMode } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth.store';
import { fireReadyNotification } from '../lib/notifications';

const VIBRATE_OPTIONS: { value: VibrateMode; label: string; sub: string }[] = [
  { value: 'off',    label: "Yo'q",       sub: "Titroq bo'lmaydi" },
  { value: 'short',  label: 'Qisqa',      sub: '· (300ms)' },
  { value: 'double', label: 'Ikki zarba', sub: '· · (300ms + 300ms)' },
  { value: 'long',   label: 'Uzun',       sub: '——— (700ms)' },
];

function RadioRow({
  selected, label, sub, onPress,
}: {
  selected: boolean; label: string; sub: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.radioRow, selected && styles.radioRowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.radioCircle, selected && styles.radioCircleOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.radioText}>
        <Text style={[styles.radioLabel, selected && styles.radioLabelOn]}>{label}</Text>
        <Text style={styles.radioSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const nav = useNavigation();
  const { vibrateMode, setVibrateMode, serverUrl, setServerUrl } = useSettingsStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [testing, setTesting] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl);

  const handleTest = async () => {
    setTesting(true);
    await fireReadyNotification();
    setTesting(false);
  };

  const handleSaveUrl = () => {
    const url = urlInput.trim().replace(/\/$/, '');
    if (!url) return;
    Alert.alert(
      'Server manzilini o\'zgartirish',
      `Yangi manzil: ${url}\n\nDastur qayta ulanadi.`,
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Saqlash', onPress: () => {
            setServerUrl(url);
            void clearAuth();
            setEditingUrl(false);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bildirishnoma sozlamalari</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        <Text style={styles.sectionTitle}>SERVER</Text>
        <View style={styles.card}>
          {editingUrl ? (
            <View style={styles.urlEditRow}>
              <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={setUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSaveUrl}
              />
              <TouchableOpacity style={styles.urlSaveBtn} onPress={handleSaveUrl}>
                <Text style={styles.urlSaveBtnText}>Saqlash</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.urlRow} onPress={() => { setUrlInput(serverUrl); setEditingUrl(true); }} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.urlLabel}>Master server</Text>
                <Text style={styles.urlValue}>{serverUrl}</Text>
              </View>
              <Text style={styles.urlEditHint}>Tahrirlash</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>OVOZ</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🔔</Text>
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Telefon bildirishnoma ovozi</Text>
              <Text style={styles.infoDesc}>
                Signal ovozi telefoningiz bildirishnoma sozlamalaridan olinadi.
                O'zgartirish uchun qurilma sozlamalarini oching.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.openSettingsBtn}
            onPress={() => void Linking.openSettings()}
            activeOpacity={0.75}
          >
            <Text style={styles.openSettingsBtnText}>Qurilma sozlamalarini ochish →</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>TITROQ</Text>
        <View style={styles.card}>
          {VIBRATE_OPTIONS.map((opt) => (
            <RadioRow
              key={opt.value}
              selected={vibrateMode === opt.value}
              label={opt.label}
              sub={opt.sub}
              onPress={() => setVibrateMode(opt.value)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.testBtn, testing && styles.testBtnBusy]}
          onPress={handleTest}
          disabled={testing}
          activeOpacity={0.8}
        >
          {testing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.testBtnText}>🔔 Sinab ko'rish</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Haqiqiy "Buyurtma tayyor!" signali aynan shunday ishlaydi.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: '#2563eb' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  scroll: { padding: 16, paddingBottom: 40 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    letterSpacing: 1, marginBottom: 8, marginTop: 20, paddingLeft: 4,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb',
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12,
  },
  infoIcon: { fontSize: 22, marginTop: 1 },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  infoDesc: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  openSettingsBtn: {
    marginHorizontal: 16, marginBottom: 14, paddingVertical: 12,
    borderRadius: 10, backgroundColor: '#eff6ff',
    borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'center',
  },
  openSettingsBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },

  radioRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 14,
  },
  radioRowSelected: { backgroundColor: '#eff6ff' },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#d1d5db',
    justifyContent: 'center', alignItems: 'center',
  },
  radioCircleOn: { borderColor: '#2563eb' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb' },
  radioText: { flex: 1 },
  radioLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  radioLabelOn: { color: '#1d4ed8' },
  radioSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  testBtn: {
    marginTop: 28, backgroundColor: '#2563eb',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  testBtnBusy: { backgroundColor: '#93c5fd' },
  testBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  hint: {
    marginTop: 12, fontSize: 12, color: '#9ca3af',
    textAlign: 'center', lineHeight: 18,
  },

  urlRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  urlLabel: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  urlValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  urlEditHint: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  urlEditRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  urlInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827',
  },
  urlSaveBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  urlSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getMasterUrl } from '../lib/env';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { useSettingsStore, VibrateMode } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { fireReadyNotification } from '../lib/notifications';

const VIBRATE_OPTIONS: { value: VibrateMode; label: string; sub: string }[] = [
  { value: 'off', label: "Yo'q", sub: "Titroq bo'lmaydi" },
  { value: 'short', label: 'Qisqa', sub: '· (300ms)' },
  { value: 'double', label: 'Ikki zarba', sub: '· · (300ms + 300ms)' },
  { value: 'long', label: 'Uzun', sub: '——— (700ms)' },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Hali yo'q";
  }

  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

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
  const lastSuccessfulContact = useConnectionStore((s) => s.lastSuccessfulContact);
  const markSuccessfulContact = useConnectionStore((s) => s.markSuccessfulContact);
  const [testingNotification, setTestingNotification] = useState(false);
  const [testingServer, setTestingServer] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl || getMasterUrl() || '');
  const [serverResult, setServerResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const currentUrl = useMemo(() => serverUrl || getMasterUrl() || 'Server tanlanmagan', [serverUrl]);

  const handleNotificationTest = async () => {
    setTestingNotification(true);
    await fireReadyNotification();
    setTestingNotification(false);
  };

  const handleServerTest = async () => {
    const activeUrl = currentUrl === 'Server tanlanmagan' ? '' : currentUrl;
    if (!activeUrl) {
      setServerResult({ tone: 'error', message: 'Server manzili tanlanmagan.' });
      return;
    }

    setTestingServer(true);
    setServerResult(null);
    try {
      await checkServerHealth(activeUrl);
      markSuccessfulContact();
      setServerResult({ tone: 'success', message: 'Server javob berdi.' });
    } catch (error) {
      setServerResult({ tone: 'error', message: `Server topilmadi. ${getErrorMessage(error)}` });
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveUrl = async () => {
    const url = normalizeUrl(urlInput);
    if (!url) {
      setServerResult({ tone: 'error', message: 'Server manzilini kiriting.' });
      return;
    }

    setTestingServer(true);
    setServerResult(null);
    try {
      await checkServerHealth(url);
      setServerUrl(url);
      markSuccessfulContact();
      setServerResult({ tone: 'success', message: 'Yangi server saqlandi.' });
      setEditingUrl(false);
      await clearAuth();
    } catch (error) {
      setServerResult({ tone: 'error', message: `Serverni tekshirib bo'lmadi. ${getErrorMessage(error)}` });
    } finally {
      setTestingServer(false);
    }
  };

  const handleResetConnection = () => {
    Alert.alert(
      'Aloqani tiklash',
      "Server manzili o'chiriladi va sozlash ekrani qayta ochiladi.",
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Tiklash',
          style: 'destructive',
          onPress: async () => {
            setServerUrl('');
            await clearAuth();
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
        <Text style={styles.headerTitle}>Sozlamalar</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>SERVER</Text>
        <View style={styles.card}>
          <View style={styles.serverSummary}>
            <Text style={styles.serverSummaryLabel}>Hozirgi server</Text>
            <Text style={styles.serverSummaryValue}>{currentUrl}</Text>
            <Text style={styles.serverSummaryMeta}>
              Oxirgi muvaffaqiyatli aloqa: {formatDateTime(lastSuccessfulContact)}
            </Text>
          </View>

          {editingUrl ? (
            <View style={styles.urlEditBox}>
              <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={(value) => { setUrlInput(value); setServerResult(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={() => void handleSaveUrl()}
              />
              <View style={styles.urlActionRow}>
                <TouchableOpacity style={styles.urlCancelBtn} onPress={() => { setEditingUrl(false); setUrlInput(serverUrl || getMasterUrl() || ''); }}>
                  <Text style={styles.urlCancelText}>Bekor qilish</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.urlSaveBtn} onPress={() => void handleSaveUrl()}>
                  <Text style={styles.urlSaveBtnText}>Saqlash</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.serverActions}>
            <TouchableOpacity style={styles.serverActionBlue} onPress={() => void handleServerTest()} disabled={testingServer}>
              <Text style={styles.serverActionTitle}>Aloqani tekshirish</Text>
              <Text style={styles.serverActionSub}>`/api/health` orqali</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.serverActionSky} onPress={() => setEditingUrl(true)}>
              <Text style={styles.serverActionTitleSky}>Serverni o'zgartirish</Text>
              <Text style={styles.serverActionSub}>Yangi manzilni saqlash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.serverActionRed} onPress={handleResetConnection}>
              <Text style={styles.serverActionTitleRed}>Aloqani tiklash</Text>
              <Text style={styles.serverActionSub}>Sozlash ekraniga qaytish</Text>
            </TouchableOpacity>
          </View>

          {serverResult && (
            <View style={[styles.resultBox, serverResult.tone === 'success' ? styles.resultSuccess : styles.resultError]}>
              <Text style={[styles.resultText, serverResult.tone === 'success' ? styles.resultTextSuccess : styles.resultTextError]}>
                {serverResult.message}
              </Text>
            </View>
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
          style={[styles.testBtn, testingNotification && styles.testBtnBusy]}
          onPress={() => void handleNotificationTest()}
          disabled={testingNotification}
          activeOpacity={0.8}
        >
          {testingNotification
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.testBtnText}>🔔 Bildirishnomani sinab ko'rish</Text>}
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
    paddingBottom: 14,
  },
  serverSummary: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  serverSummaryLabel: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  serverSummaryValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  serverSummaryMeta: { marginTop: 8, fontSize: 12, color: '#94a3b8' },
  serverActions: { paddingHorizontal: 12, gap: 10 },
  serverActionBlue: { borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 14 },
  serverActionSky: { borderRadius: 12, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', padding: 14 },
  serverActionRed: { borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', padding: 14 },
  serverActionTitle: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  serverActionTitleSky: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
  serverActionTitleRed: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  serverActionSub: { marginTop: 4, fontSize: 12, color: '#64748b' },
  urlEditBox: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  urlInput: {
    borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827',
  },
  urlActionRow: { flexDirection: 'row', gap: 8 },
  urlCancelBtn: {
    flex: 1, backgroundColor: '#e5e7eb', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  urlCancelText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  urlSaveBtn: {
    flex: 1, backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  urlSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultBox: {
    marginTop: 12, marginHorizontal: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  resultSuccess: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#bbf7d0' },
  resultError: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  resultText: { fontSize: 13, fontWeight: '600' },
  resultTextSuccess: { color: '#15803d' },
  resultTextError: { color: '#b91c1c' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
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
});

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
  ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMasterUrl } from '../lib/env';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { useSettingsStore, VibrateMode } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { fireReadyNotification } from '../lib/notifications';
import { theme } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

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
  const { status, lastSuccessfulContact, markSuccessfulContact } = useConnectionStore();
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

  const connectionBadge = useMemo(() => {
    switch (status) {
      case 'online': return { label: 'ONLAYN', variant: 'success' as const };
      case 'connecting': return { label: 'ULANMOQDA...', variant: 'warning' as const };
      case 'reconnecting': return { label: 'QAYTA ULANMOQDA...', variant: 'warning' as const };
      case 'auth-failed': return { label: 'SESSİYA TUGADI', variant: 'danger' as const };
      default: return { label: 'OFLAYN', variant: 'danger' as const };
    }
  }, [status]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sozlamalar</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>ALOQA HOLATI</Text>
        <Card style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Hozirgi holat:</Text>
            <Badge label={connectionBadge.label} variant={connectionBadge.variant} />
          </View>
          <View style={styles.serverSummary}>
            <Text style={styles.serverSummaryLabel}>Master server:</Text>
            <Text style={styles.serverSummaryValue}>{currentUrl}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.serverSummaryMeta}>
                Oxirgi aloqa: {formatDateTime(lastSuccessfulContact)}
              </Text>
            </View>
          </View>

          {editingUrl ? (
            <View style={styles.urlEditBox}>
              <Input
                value={urlInput}
                onChangeText={(value) => { setUrlInput(value); setServerResult(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={() => void handleSaveUrl()}
                placeholder="192.168.1.50"
              />
              <View style={styles.urlActionRow}>
                <Button
                  title="Bekor"
                  variant="secondary"
                  size="sm"
                  style={styles.flex1}
                  onPress={() => { setEditingUrl(false); setUrlInput(serverUrl || getMasterUrl() || ''); }}
                />
                <Button
                  title="Saqlash"
                  size="sm"
                  style={styles.flex1}
                  loading={testingServer}
                  onPress={() => void handleSaveUrl()}
                />
              </View>
            </View>
          ) : (
            <View style={styles.serverActions}>
              <Button
                title="Aloqani tekshirish"
                variant="outline"
                size="sm"
                loading={testingServer}
                onPress={() => void handleServerTest()}
              />
              <View style={styles.row}>
                <Button
                  title="O'zgartirish"
                  variant="secondary"
                  size="sm"
                  style={styles.flex1}
                  onPress={() => setEditingUrl(true)}
                />
                <Button
                  title="Tiklash"
                  variant="secondary"
                  size="sm"
                  style={styles.flex1}
                  onPress={handleResetConnection}
                  textStyle={{ color: theme.colors.danger }}
                />
              </View>
            </View>
          )}

          {serverResult && (
            <Badge
              label={serverResult.message}
              variant={serverResult.tone === 'success' ? 'success' : 'danger'}
              style={styles.resultBadge}
            />
          )}
        </Card>

        <Text style={styles.sectionTitle}>BILDIRISHNOMALAR</Text>
        <Card style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="bell-outline" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Bildirishnoma ovozi</Text>
              <Text style={styles.infoDesc}>
                Signal ovozi telefoningiz bildirishnoma sozlamalaridan olinadi.
              </Text>
            </View>
          </View>
          <Button
            title="Qurilma sozlamalarini ochish"
            variant="ghost"
            size="sm"
            onPress={() => void Linking.openSettings()}
            style={styles.openSettingsBtn}
          />
        </Card>

        <Text style={styles.sectionTitle}>TITROQ (VIBRATSIYA)</Text>
        <Card style={styles.cardNoPadding}>
          {VIBRATE_OPTIONS.map((opt) => (
            <RadioRow
              key={opt.value}
              selected={vibrateMode === opt.value}
              label={opt.label}
              sub={opt.sub}
              onPress={() => setVibrateMode(opt.value)}
            />
          ))}
        </Card>

        <View style={styles.footer}>
          <Button
            title="SİNAB KO'RİSH"
            loading={testingNotification}
            onPress={() => void handleNotificationTest()}
            style={styles.testBtn}
          />
          <Text style={styles.hint}>
            Haqiqiy "Buyurtma tayyor!" signali aynan shunday ishlaydi.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.slate[50] },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingTop: 56, paddingBottom: 14,
    backgroundColor: theme.colors.white, borderBottomWidth: 1, borderBottomColor: theme.colors.slate[100],
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.slate[900] },
  scroll: { padding: theme.spacing.lg, paddingBottom: 60 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: theme.colors.slate[500],
    letterSpacing: 1, marginBottom: 10, marginTop: 24, paddingLeft: 4,
  },
  card: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  cardNoPadding: {
    padding: 0,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.slate[50] },
  statusLabel: { fontSize: 14, color: theme.colors.slate[700], fontWeight: '600' },
  serverSummary: { marginBottom: theme.spacing.lg },
  serverSummaryLabel: { fontSize: 13, color: theme.colors.slate[500], marginBottom: 4 },
  serverSummaryValue: { fontSize: 16, fontWeight: '700', color: theme.colors.slate[900] },
  metaRow: { marginTop: 8 },
  serverSummaryMeta: { fontSize: 12, color: theme.colors.slate[400] },
  serverActions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  urlEditBox: { gap: 10 },
  urlActionRow: { flexDirection: 'row', gap: 10 },
  resultBadge: {
    marginTop: theme.spacing.lg,
    alignSelf: 'stretch',
    paddingVertical: theme.spacing.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md, gap: 16 },
  iconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.slate[800], marginBottom: 2 },
  infoDesc: { fontSize: 14, color: theme.colors.slate[500], lineHeight: 20 },
  openSettingsBtn: {
    alignSelf: 'flex-start',
  },
  radioRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.slate[50], gap: 14,
  },
  radioRowSelected: { backgroundColor: theme.colors.primaryLight },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: theme.colors.slate[300],
    justifyContent: 'center', alignItems: 'center',
  },
  radioCircleOn: { borderColor: theme.colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  radioText: { flex: 1 },
  radioLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.slate[800] },
  radioLabelOn: { color: theme.colors.primary },
  radioSub: { fontSize: 12, color: theme.colors.slate[400], marginTop: 1 },
  footer: { marginTop: 40, alignItems: 'center' },
  testBtn: { width: '100%', marginBottom: theme.spacing.md },
  hint: {
    fontSize: 13, color: theme.colors.slate[400],
    textAlign: 'center', lineHeight: 20,
  },
});

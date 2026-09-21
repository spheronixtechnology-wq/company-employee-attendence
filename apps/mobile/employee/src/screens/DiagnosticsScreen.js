import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Home,
  Wifi,
  Zap,
  HardDrive,
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Shield,
  Server,
} from 'lucide-react-native';
import api, { getBaseUrl } from '../lib/api';
import { useSocket, getSocketUrl } from '../contexts/SocketContext';
import { getDeviceInfo } from '../lib/device';
import { setSecureItem, getSecureItem } from '../lib/storage';

// ─── Animated status dot ───────────────────────────────────────────────────────
function PulseDot({ color }) {
  const pulse = React.useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          opacity: 0.35,
          transform: [{ scale: pulse }],
          position: 'absolute',
        }}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

// ─── Metric Row ────────────────────────────────────────────────────────────────
function MetricRow({ label, value, mono }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, mono && styles.monoText]}>{value}</Text>
    </View>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ok:          { bg: '#dcfce7', text: '#15803d', label: 'REACHABLE' },
    error:       { bg: '#fee2e2', text: '#b91c1c', label: 'OFFLINE'   },
    connected:   { bg: '#dcfce7', text: '#15803d', label: 'CONNECTED' },
    disconnected:{ bg: '#fee2e2', text: '#b91c1c', label: 'DISCONNECTED' },
    encrypted:   { bg: '#ede9fe', text: '#6d28d9', label: 'ENCRYPTED' },
    verifying:   { bg: '#fef3c7', text: '#b45309', label: 'VERIFYING' },
    loading:     { bg: '#f1f5f9', text: '#64748b', label: 'TESTING'   },
  };
  const cfg = map[status] || map.loading;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DiagnosticsScreen({ onBack }) {
  const { socket, isConnected: isSocketConnected } = useSocket();

  const [deviceInfo, setDeviceInfo]     = useState(null);
  const [apiTesting, setApiTesting]     = useState(false);
  const [apiResult, setApiResult]       = useState(null);
  const [storageTesting, setStorageTesting] = useState(false);
  const [storageResult, setStorageResult]   = useState(null);

  useEffect(() => {
    getDeviceInfo().then(setDeviceInfo).catch(console.error);
    runApiTest();
    runStorageTest();
  }, []);

  const runApiTest = async () => {
    setApiTesting(true);
    setApiResult(null);
    const start = Date.now();
    try {
      const res = await api.get('/employee/status');
      setApiResult({ success: true, status: res.status, latency: Date.now() - start, data: res.data });
    } catch (err) {
      setApiResult({
        success: false,
        status: err.response?.status || 'ERR',
        latency: Date.now() - start,
        error: err.userMessage || err.message,
      });
    } finally {
      setApiTesting(false);
    }
  };

  const runStorageTest = async () => {
    setStorageTesting(true);
    try {
      const key = 'diag_test_ts';
      const val = new Date().toISOString();
      await setSecureItem(key, val);
      const read = await getSecureItem(key);
      setStorageResult({ success: read === val, value: read });
    } catch (err) {
      setStorageResult({ success: false, error: err.message });
    } finally {
      setStorageTesting(false);
    }
  };

  const apiStatus = apiTesting ? 'loading' : apiResult?.success ? 'ok' : apiResult ? 'error' : 'loading';
  const socketStatus = isSocketConnected ? 'connected' : 'disconnected';
  const storageStatus = storageTesting ? 'loading' : storageResult?.success ? 'encrypted' : storageResult ? 'error' : 'verifying';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Gradient Hero Header ─────────────────────────────────────── */}
      <View style={styles.heroHeader}>
        {/* Navigation row */}
        <View style={styles.heroNav}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.navBackPill} activeOpacity={0.8}>
              <ArrowLeft size={14} color="#94a3b8" />
              <Text style={styles.navBackText}>Back to Home</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.navHomeBtn} activeOpacity={0.8}>
              <Home size={15} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Hero Content */}
        <View style={styles.heroContent}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Shield size={10} color="#818cf8" />
              <Text style={styles.heroBadgeText}>DIAGNOSTICS</Text>
            </View>
            <View style={styles.heroBadge}>
              <Activity size={10} color="#34d399" />
              <Text style={[styles.heroBadgeText, { color: '#34d399' }]}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>System Diagnostics</Text>
          <Text style={styles.heroSubtitle}>
            Backend connectivity, real-time channel & secure storage verification
          </Text>

          {/* Live status row */}
          <View style={styles.heroStatusRow}>
            <PulseDot color={isSocketConnected ? '#34d399' : '#f87171'} />
            <Text style={styles.heroStatusText}>
              {isSocketConnected ? 'All systems operational' : 'Connectivity degraded'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 1. API Gateway ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={[styles.cardIconBox, { backgroundColor: '#eff6ff' }]}>
              <Server size={18} color="#2563eb" />
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTitle}>API Gateway</Text>
              <Text style={styles.cardCaption}>HTTP REST Connectivity</Text>
            </View>
            <StatusBadge status={apiStatus} />
          </View>

          <View style={styles.divider} />

          <MetricRow label="Endpoint" value={getBaseUrl()} mono />
          {apiResult && (
            <>
              <MetricRow label="HTTP Status" value={`${apiResult.status}`} />
              <MetricRow label="Latency" value={`${apiResult.latency} ms`} />
              {apiResult.success && apiResult.data ? (
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{JSON.stringify(apiResult.data, null, 2)}</Text>
                </View>
              ) : apiResult.error ? (
                <View style={[styles.codeBox, { borderColor: '#fecaca', backgroundColor: '#fff1f2' }]}>
                  <Text style={[styles.codeText, { color: '#dc2626' }]}>{apiResult.error}</Text>
                </View>
              ) : null}
            </>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, apiTesting && styles.actionBtnDisabled]}
            onPress={runApiTest}
            disabled={apiTesting}
            activeOpacity={0.85}
          >
            {apiTesting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <RefreshCw size={14} color="#ffffff" />
            )}
            <Text style={styles.actionBtnText}>
              {apiTesting ? 'Testing…' : 'Re-test API Connection'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. Socket.IO ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={[styles.cardIconBox, { backgroundColor: isSocketConnected ? '#f0fdf4' : '#fff1f2' }]}>
              <Zap size={18} color={isSocketConnected ? '#16a34a' : '#e11d48'} />
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTitle}>Socket.IO</Text>
              <Text style={styles.cardCaption}>Real-Time Bidirectional Channel</Text>
            </View>
            <StatusBadge status={socketStatus} />
          </View>

          <View style={styles.divider} />

          <MetricRow label="Server" value={getSocketUrl()} mono />
          <MetricRow label="Socket ID" value={socket?.id || '— (awaiting)'} mono />
          <MetricRow label="Transport" value={socket?.io?.engine?.transport?.name || 'N/A'} />

          <View style={styles.socketLiveRow}>
            <PulseDot color={isSocketConnected ? '#10b981' : '#f43f5e'} />
            <Text style={[styles.socketLiveText, { color: isSocketConnected ? '#059669' : '#dc2626' }]}>
              {isSocketConnected ? 'Connection established & authenticated' : 'Not connected — check network or backend'}
            </Text>
          </View>
        </View>

        {/* ── 3. Secure Storage ────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={[styles.cardIconBox, { backgroundColor: '#faf5ff' }]}>
              <HardDrive size={18} color="#7c3aed" />
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTitle}>Secure Storage</Text>
              <Text style={styles.cardCaption}>Android KeyStore / EncryptedSharedPrefs</Text>
            </View>
            <StatusBadge status={storageStatus} />
          </View>

          <View style={styles.divider} />

          <MetricRow label="Read/Write" value={storageResult ? (storageResult.success ? 'Verified ✓' : 'Failed ✗') : 'Testing…'} />
          {storageResult?.value && (
            <MetricRow label="Test Timestamp" value={storageResult.value} mono />
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary, storageTesting && styles.actionBtnDisabled]}
            onPress={runStorageTest}
            disabled={storageTesting}
            activeOpacity={0.85}
          >
            {storageTesting ? (
              <ActivityIndicator size="small" color="#7c3aed" />
            ) : (
              <HardDrive size={14} color="#7c3aed" />
            )}
            <Text style={[styles.actionBtnText, { color: '#7c3aed' }]}>
              {storageTesting ? 'Verifying…' : 'Re-test SecureStore'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. Device Context ────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={[styles.cardIconBox, { backgroundColor: '#fff7ed' }]}>
              <Cpu size={18} color="#ea580c" />
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTitle}>Native Device Context</Text>
              <Text style={styles.cardCaption}>Hardware signals & device fingerprint</Text>
            </View>
          </View>

          <View style={styles.infoNotice}>
            <Shield size={12} color="#0369a1" />
            <Text style={styles.infoNoticeText}>
              Device info ≠ device identity. Identity is managed server-side via deviceToken binding.
            </Text>
          </View>

          <View style={styles.divider} />

          {deviceInfo ? (
            <>
              <MetricRow label="Brand" value={deviceInfo.brand} />
              <MetricRow label="Model" value={deviceInfo.model} />
              <MetricRow label="OS & Version" value={`${deviceInfo.os} ${deviceInfo.osVersion}`} />
              <MetricRow label="Device Label" value={deviceInfo.deviceLabel} />
              <MetricRow label="Fingerprint (24)" value={`${deviceInfo.fingerprint?.slice(0, 24)}…`} mono />
            </>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#ea580c" />
              <Text style={styles.loadingText}>Loading device signals…</Text>
            </View>
          )}
        </View>

        {/* ── Bottom Back Button ───────────────────────────────────────── */}
        {onBack && (
          <TouchableOpacity style={styles.bottomBackBtn} activeOpacity={0.8} onPress={onBack}>
            <Home size={15} color="#334155" />
            <Text style={styles.bottomBackBtnText}>Back to Home Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  /* ── Hero Header ── */
  heroHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  navBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navBackText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  navHomeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingTop: 4,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#818cf8',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 14,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },

  /* ── Scroll ── */
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },

  /* ── Card ── */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  cardCaption: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },

  /* ── Status Badge ── */
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* ── Metrics ── */
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    flex: 0.45,
  },
  metricValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
    flex: 0.55,
    textAlign: 'right',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#475569',
  },

  /* ── Code box ── */
  codeBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  codeText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#475569',
    lineHeight: 16,
  },

  /* ── Action button ── */
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 14,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  actionBtnSecondary: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1.5,
    borderColor: '#ede9fe',
    shadowColor: 'transparent',
    elevation: 0,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ── Socket live status ── */
  socketLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  socketLiveText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
  },

  /* ── Info notice ── */
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  infoNoticeText: {
    fontSize: 11,
    color: '#1e40af',
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },

  /* ── Loading state ── */
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },

  /* ── Bottom nav ── */
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bottomBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
});

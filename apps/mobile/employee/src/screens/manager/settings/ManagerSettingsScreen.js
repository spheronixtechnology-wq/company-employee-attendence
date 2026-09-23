import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
  Modal, Switch, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ShieldCheck, MapPin, Building2, Wifi, Activity,
  QrCode, Fingerprint, Plus, Trash2, Edit2, 
  ChevronLeft, Loader2, Check
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';

const colors = {
  primary: '#8b5cf6', // Violet
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

const ATTENDANCE_METHODS = [
  { key: 'qr_code', label: 'QR Code Attendance', icon: QrCode, desc: 'Daily dynamic rotating QR code. Employees scan the office QR display at check-in.', badge: 'Popular' },
  { key: 'wifi_ip', label: 'WiFi / IP Network Gate', icon: Wifi, desc: 'Validates employee presence on approved office Wi-Fi networks by checking IP/subnet match.', badge: 'Zero-touch' },
  { key: 'biometric', label: 'Biometric (WebAuthn)', icon: Fingerprint, desc: 'Device-owner biometric verification using hardware sensors.', badge: 'High Security' },
];

export default function ManagerSettingsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('attendance');
  const [refreshing, setRefreshing] = useState(false);

  // --- Attendance Method State ---
  const [currentMethod, setCurrentMethod] = useState(null);
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false);
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(8);
  const [loadingMethod, setLoadingMethod] = useState(true);

  // --- Office Locations State ---
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  
  // Location Form Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [form, setForm] = useState({
    officeName: '', latitude: '', longitude: '',
    radiusMeters: '200', wifiSsid: '', allowedIps: '', status: 'active'
  });

  const fetchActiveMethod = useCallback(async () => {
    try {
      const res = await managerApi.getActiveAttendanceMethod();
      const data = res.data?.data;
      setCurrentMethod(data?.activeMethod);
      setHeartbeatEnabled(data?.heartbeatMonitoringEnabled === true);
      setHeartbeatTimeout(data?.heartbeatTimeoutMinutes || 8);
    } catch (err) {
      console.error('Failed to load active method:', err);
    } finally {
      setLoadingMethod(false);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await managerApi.getOfficeLocations();
      setLocations(res.data?.data?.locations || []);
    } catch (err) {
      console.error('Failed to load locations:', err);
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveMethod();
    fetchLocations();
  }, [fetchActiveMethod, fetchLocations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchActiveMethod(), fetchLocations()]);
    setRefreshing(false);
  };

  // --- Handlers: Attendance Method ---
  const handleSwitchMethod = (methodKey, label) => {
    Alert.prompt(
      `Switch to ${label}`,
      `Reason for switching attendance verification method to "${label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async (reason) => {
            if (!reason) {
              Alert.alert('Error', 'Reason is required to switch attendance methods.');
              return;
            }
            try {
              await managerApi.switchAttendanceMethod({ method: methodKey, reason: reason.trim() });
              setCurrentMethod(methodKey);
              Alert.alert('Success', `Method switched to ${label}`);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to switch method.');
            }
          }
        }
      ]
    );
  };

  const handleToggleHeartbeat = async (value) => {
    try {
      const res = await managerApi.heartbeatAttendanceMethod({
        enabled: value,
        timeoutMinutes: heartbeatTimeout
      });
      setHeartbeatEnabled(res.data?.data?.heartbeatMonitoringEnabled === true);
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle heartbeat monitoring.');
      setHeartbeatEnabled(!value);
    }
  };

  // --- Handlers: Office Locations ---
  const openAddLocation = () => {
    setEditingId(null);
    setForm({ officeName: '', latitude: '', longitude: '', radiusMeters: '200', wifiSsid: '', allowedIps: '', status: 'active' });
    setModalVisible(true);
  };

  const openEditLocation = (loc) => {
    setEditingId(loc._id);
    setForm({
      officeName: loc.officeName || '',
      latitude: loc.latitude?.toString() || '',
      longitude: loc.longitude?.toString() || '',
      radiusMeters: loc.radiusMeters?.toString() || '200',
      wifiSsid: loc.wifiSsid || '',
      allowedIps: Array.isArray(loc.allowedIps) ? loc.allowedIps.join(', ') : (loc.allowedIps || ''),
      status: loc.status || 'active',
    });
    setModalVisible(true);
  };

  const saveLocation = async () => {
    if (!form.officeName || !form.latitude || !form.longitude || !form.radiusMeters) {
      Alert.alert('Error', 'Office name, latitude, longitude, and radius are required.');
      return;
    }
    setSavingLocation(true);
    try {
      const payload = {
        ...form,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        radiusMeters: parseInt(form.radiusMeters, 10),
      };
      
      if (editingId) {
        await managerApi.updateOfficeLocation(editingId, payload);
      } else {
        await managerApi.createOfficeLocation(payload);
      }
      setModalVisible(false);
      fetchLocations();
      Alert.alert('Success', `Office location ${editingId ? 'updated' : 'added'}.`);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save location.');
    } finally {
      setSavingLocation(false);
    }
  };

  const deleteLocation = (id) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this office location?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await managerApi.deleteOfficeLocation(id);
            fetchLocations();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete location.');
          }
        }
      }
    ]);
  };

  const handleAutoDetectIp = async () => {
    setDetectingIp(true);
    try {
      const res = await managerApi.getCurrentIp();
      const detected = res.data?.data?.ip;
      if (detected) {
        setForm(prev => {
          const existing = prev.allowedIps ? prev.allowedIps.split(',').map(s => s.trim()).filter(Boolean) : [];
          if (!existing.includes(detected)) existing.push(detected);
          return { ...prev, allowedIps: existing.join(', ') };
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to detect current IP address.');
    } finally {
      setDetectingIp(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={{ marginRight: 16 }}>
          <ChevronLeft size={28} color="#334155" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Manager Settings</Text>
          <Text style={styles.headerSubtitle}>Organization configurations</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'attendance' && styles.tabBtnActive]}
          onPress={() => setActiveTab('attendance')}
        >
          <ShieldCheck size={16} color={activeTab === 'attendance' ? colors.primary : colors.secondary} />
          <Text style={[styles.tabText, activeTab === 'attendance' && { color: colors.primary }]}>Attendance Mode</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'locations' && styles.tabBtnActive]}
          onPress={() => setActiveTab('locations')}
        >
          <Building2 size={16} color={activeTab === 'locations' ? colors.primary : colors.secondary} />
          <Text style={[styles.tabText, activeTab === 'locations' && { color: colors.primary }]}>Office Locations</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {activeTab === 'attendance' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Verification Method</Text>
              <Text style={styles.sectionSubtitle}>Select the primary method employees will use to clock in.</Text>
            </View>

            {loadingMethod && !refreshing ? <ActivityIndicator color={colors.primary} /> : (
              methodsList(currentMethod, handleSwitchMethod)
            )}

            <View style={[styles.card, { marginTop: 24 }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <View style={styles.rowCenter}>
                    <Activity size={18} color={colors.primary} />
                    <Text style={styles.cardTitle}>Continuous Heartbeat Monitoring</Text>
                  </View>
                  <Text style={styles.cardDesc}>
                    When enabled, the app regularly checks if the employee is still at the office. If they leave the bounds, they are auto-checked out.
                  </Text>
                </View>
                <Switch
                  value={heartbeatEnabled}
                  onValueChange={handleToggleHeartbeat}
                  trackColor={{ true: colors.primary, false: '#e2e8f0' }}
                />
              </View>
            </View>
          </View>
        )}

        {activeTab === 'locations' && (
          <View>
            <View style={[styles.rowBetween, { marginBottom: 16 }]}>
              <View>
                <Text style={styles.sectionTitle}>Office Geofences</Text>
                <Text style={styles.sectionSubtitle}>Manage physical bounds for check-ins.</Text>
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={openAddLocation}>
                <Plus size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add Office</Text>
              </TouchableOpacity>
            </View>

            {loadingLocations && !refreshing ? <ActivityIndicator color={colors.primary} /> : locations.length === 0 ? (
              <View style={styles.emptyBox}>
                <Building2 size={40} color="#cbd5e1" />
                <Text style={styles.emptyText}>No office locations found.</Text>
              </View>
            ) : (
              locations.map(loc => (
                <View key={loc._id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <View style={styles.rowCenter}>
                      <MapPin size={20} color={colors.primary} />
                      <Text style={[styles.cardTitle, { fontSize: 16, marginLeft: 8 }]}>{loc.officeName}</Text>
                      {loc.status === 'inactive' && (
                        <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>Inactive</Text></View>
                      )}
                    </View>
                    <View style={styles.rowCenter}>
                      <TouchableOpacity onPress={() => openEditLocation(loc)} style={styles.iconBtn}>
                        <Edit2 size={16} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteLocation(loc._id)} style={styles.iconBtn}>
                        <Trash2 size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.locDetails}>
                    <Text style={styles.locDetailText}>Coordinates: {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</Text>
                    <Text style={styles.locDetailText}>Radius: {loc.radiusMeters}m</Text>
                    {loc.wifiSsid ? <Text style={styles.locDetailText}>Wi-Fi SSID: {loc.wifiSsid}</Text> : null}
                    {loc.allowedIps?.length > 0 ? <Text style={styles.locDetailText}>Allowed IPs: {loc.allowedIps.join(', ')}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Location Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Location' : 'Add Office Location'}</Text>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Office Name *</Text>
                <TextInput style={styles.input} value={form.officeName} onChangeText={t => setForm({...form, officeName: t})} placeholder="e.g. Headquarters" />
              </View>

              <View style={styles.rowGap}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Latitude *</Text>
                  <TextInput style={styles.input} value={form.latitude} onChangeText={t => setForm({...form, latitude: t})} keyboardType="numeric" placeholder="e.g. 17.3850" />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Longitude *</Text>
                  <TextInput style={styles.input} value={form.longitude} onChangeText={t => setForm({...form, longitude: t})} keyboardType="numeric" placeholder="e.g. 78.4867" />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Radius (meters) *</Text>
                <TextInput style={styles.input} value={form.radiusMeters} onChangeText={t => setForm({...form, radiusMeters: t})} keyboardType="numeric" />
              </View>

              <Text style={styles.sectionSubtitle}>Wi-Fi & IP Network Gate (Optional)</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Wi-Fi SSID</Text>
                <TextInput style={styles.input} value={form.wifiSsid} onChangeText={t => setForm({...form, wifiSsid: t})} placeholder="e.g. Spheronix_Corporate" />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.rowBetween}>
                  <Text style={styles.inputLabel}>Allowed Public IPs</Text>
                  <TouchableOpacity onPress={handleAutoDetectIp}>
                    <Text style={styles.linkText}>{detectingIp ? 'Detecting...' : 'Detect Current IP'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} value={form.allowedIps} onChangeText={t => setForm({...form, allowedIps: t})} placeholder="e.g. 203.0.113.1 (comma separated)" />
              </View>

              <View style={styles.rowBetween}>
                <Text style={styles.inputLabel}>Status</Text>
                <Switch 
                  value={form.status === 'active'} 
                  onValueChange={v => setForm({...form, status: v ? 'active' : 'inactive'})} 
                  trackColor={{ true: colors.success, false: '#cbd5e1' }}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={saveLocation} disabled={savingLocation}>
                {savingLocation ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnConfirmText}>Save Location</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const methodsList = (currentMethod, onSwitch) => (
  <View style={styles.methodsList}>
    {ATTENDANCE_METHODS.map(m => {
      const isActive = currentMethod === m.key;
      const Icon = m.icon;
      return (
        <View key={m.key} style={[styles.methodCard, isActive && styles.methodCardActive]}>
          <View style={styles.rowBetween}>
            <View style={styles.rowCenter}>
              <Icon size={24} color={isActive ? colors.primary : colors.secondary} />
              <Text style={[styles.methodTitle, isActive && styles.methodTitleActive]}>{m.label}</Text>
            </View>
            {isActive ? (
              <View style={styles.activeBadge}><Check size={12} color="#fff" /><Text style={styles.activeBadgeText}>Active</Text></View>
            ) : (
              <TouchableOpacity style={styles.switchBtn} onPress={() => onSwitch(m.key, m.label)}>
                <Text style={styles.switchBtnText}>Switch</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.methodDesc}>{m.desc}</Text>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  headerTextContainer: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  
  tabsContainer: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { marginLeft: 8, fontSize: 14, fontWeight: '700', color: colors.secondary },

  content: { padding: 16, paddingBottom: 40 },
  
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sectionSubtitle: { fontSize: 13, color: colors.secondary, marginTop: 4, marginBottom: 12 },

  methodsList: { gap: 12 },
  methodCard: { backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  methodCardActive: { borderColor: colors.primary, backgroundColor: '#f5f3ff' },
  methodTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginLeft: 12 },
  methodTitleActive: { color: colors.primary },
  methodDesc: { fontSize: 13, color: colors.secondary, marginTop: 12, lineHeight: 18 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  activeBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  switchBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  switchBtnText: { fontSize: 12, fontWeight: '700', color: colors.secondary },

  card: { backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginLeft: 8 },
  cardDesc: { fontSize: 13, color: colors.secondary, marginTop: 8, lineHeight: 18 },
  
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  rowGap: { flexDirection: 'row', gap: 12 },

  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 4 },

  locDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  locDetailText: { fontSize: 13, color: colors.secondary, marginBottom: 4 },
  iconBtn: { padding: 8, marginLeft: 8, backgroundColor: '#f1f5f9', borderRadius: 8 },
  inactiveBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  inactiveText: { fontSize: 10, color: colors.secondary, fontWeight: 'bold' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  emptyText: { marginTop: 12, color: colors.secondary, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalScroll: { marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, color: '#0f172a' },
  linkText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtnCancel: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600', color: colors.secondary },
  modalBtnConfirm: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary },
  modalBtnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

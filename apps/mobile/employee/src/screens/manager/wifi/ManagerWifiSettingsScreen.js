import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Wifi, MapPin, Shield, CheckCircle, AlertCircle, 
  Loader2, RefreshCw, Zap, Globe, Network, ChevronLeft, ChevronDown, Check
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';

const colors = {
  primary: '#14b8a6', // Teal for Wifi
  primaryLight: '#ccfbf1',
  primaryDark: '#0f766e',
  secondary: '#64748b',
  success: '#10b981',
  successLight: '#d1fae5',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  textDark: '#0f172a',
};

export default function ManagerWifiSettingsScreen({ navigation }) {
  const [locations, setLocations] = useState([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switchingMethod, setSwitchingMethod] = useState(false);
  
  const [activeMethod, setActiveMethod] = useState('');
  
  const [networkInfo, setNetworkInfo] = useState({
    ip: null,
    publicIpv4: null,
    publicIpv6: null,
    ipv6Subnet: null,
    localWifi: null,
    wifiSsid: null,
  });

  const [form, setForm] = useState({
    wifiSsid: '',
    allowedIps: [],
  });

  const fetchData = useCallback(async (isPull = false) => {
    if (!isPull) setLoading(true);
    try {
      const [locRes, methodRes, ipRes] = await Promise.allSettled([
        managerApi.getOfficeLocations(),
        managerApi.getActiveAttendanceMethod(),
        managerApi.getCurrentIp(),
      ]);

      let loadedLocations = [];
      if (locRes.status === 'fulfilled') {
        loadedLocations = locRes.value.data?.data?.locations || [];
        setLocations(loadedLocations);
      }

      if (methodRes.status === 'fulfilled') {
        setActiveMethod(methodRes.value.data?.data?.activeMethod || '');
      }

      let networkData = null;
      if (ipRes.status === 'fulfilled') {
        networkData = ipRes.value.data?.data;
        if (networkData) {
          setNetworkInfo({
            ip: networkData.ip || null,
            publicIpv4: networkData.publicIpv4 || networkData.publicIp || null,
            publicIpv6: networkData.publicIpv6 || null,
            ipv6Subnet: networkData.ipv6Subnet || null,
            localWifi: networkData.localWifi || null,
            wifiSsid: networkData.wifiSsid || null,
          });
        }
      }

      // Populate selected office if none selected or if refreshing
      if (loadedLocations.length > 0 && (!selectedOfficeId || isPull)) {
        const first = loadedLocations[0];
        setSelectedOfficeId(first._id);
        const officeAllowed = Array.isArray(first.allowedIps) && first.allowedIps.length > 0
          ? first.allowedIps
          : networkData?.requiredIps || [];
        
        setForm({
          wifiSsid: first.wifiSsid || networkData?.wifiSsid || '',
          allowedIps: Array.isArray(officeAllowed) ? officeAllowed : (typeof officeAllowed === 'string' ? officeAllowed.split(',').map(s => s.trim()) : []),
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load network settings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedOfficeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefreshNetwork = async () => {
    setRefreshing(true);
    try {
      const res = await managerApi.getCurrentIp();
      const networkData = res.data?.data;
      if (networkData) {
        setNetworkInfo({
          ip: networkData.ip || null,
          publicIpv4: networkData.publicIpv4 || networkData.publicIp || null,
          publicIpv6: networkData.publicIpv6 || null,
          ipv6Subnet: networkData.ipv6Subnet || null,
          localWifi: networkData.localWifi || null,
          wifiSsid: networkData.wifiSsid || null,
        });
        
        // Auto-fill SSID if blank
        if (!form.wifiSsid && networkData.wifiSsid) {
          setForm(prev => ({ ...prev, wifiSsid: networkData.wifiSsid }));
        }
      }
      Alert.alert('Network Refreshed', `Scanned: SSID "${networkData?.wifiSsid || 'N/A'}"`);
    } catch (err) {
      Alert.alert('Error', 'Failed to refresh network signature.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleOfficeChange = (officeId) => {
    const loc = locations.find(l => l._id === officeId);
    setSelectedOfficeId(officeId);
    if (loc) {
      setForm({
        wifiSsid: loc.wifiSsid || '',
        allowedIps: Array.isArray(loc.allowedIps) ? loc.allowedIps : (typeof loc.allowedIps === 'string' ? loc.allowedIps.split(',').map(s => s.trim()) : []),
      });
    }
  };

  const handleSaveNetwork = async () => {
    if (!selectedOfficeId) return Alert.alert('Error', 'No office location selected.');
    setSaving(true);
    try {
      const payload = {
        allowedIps: form.allowedIps,
        wifiSsid: form.wifiSsid.trim() || null,
      };
      await managerApi.updateOfficeLocation(selectedOfficeId, payload);
      Alert.alert('Success', 'Network configuration saved successfully!');
      fetchData(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWhitelist = (ipOrSubnet) => {
    if (!ipOrSubnet) return;
    if (form.allowedIps.includes(ipOrSubnet)) {
      Alert.alert('Info', 'This IP/Subnet is already whitelisted.');
      return;
    }
    setForm(prev => ({ ...prev, allowedIps: [...prev.allowedIps, ipOrSubnet] }));
  };

  const handleRemoveWhitelist = (ip) => {
    setForm(prev => ({ ...prev, allowedIps: prev.allowedIps.filter(i => i !== ip) }));
  };

  const handleSwitchToWifi = async () => {
    setSwitchingMethod(true);
    try {
      await managerApi.switchAttendanceMethod({
        method: 'wifi_ip',
        activeMethod: 'wifi_ip',
        reason: 'Activated via WiFi / IP Settings page',
      });
      setActiveMethod('wifi_ip');
      Alert.alert('Success', 'WiFi / IP Attendance is now the active company-wide method!');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to switch method.');
    } finally {
      setSwitchingMethod(false);
    }
  };

  const isIpv4Allowed = networkInfo.publicIpv4 ? form.allowedIps.includes(networkInfo.publicIpv4) : false;
  const isIpv6SubnetAllowed = networkInfo.ipv6Subnet ? form.allowedIps.includes(networkInfo.ipv6Subnet) : false;

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Wifi size={24} color={colors.primary} />
            <Text style={styles.headerTitle}>WiFi / IP Settings</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} colors={[colors.primary]} />}
      >
        <Text style={styles.pageSubtitle}>
          Configure office network boundaries. When enabled, employees can only check in while connected to these approved networks.
        </Text>

        {/* Status Banner */}
        {activeMethod === 'wifi_ip' ? (
          <View style={[styles.statusBanner, { backgroundColor: colors.successLight, borderColor: '#34d399' }]}>
            <CheckCircle size={20} color={colors.success} />
            <View style={styles.statusBannerText}>
              <Text style={styles.statusBannerTitle}>WiFi Network Gate is Active</Text>
              <Text style={styles.statusBannerSub}>Employees must be on an approved network.</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusBanner, { backgroundColor: '#f1f5f9', borderColor: colors.border }]}>
            <AlertCircle size={20} color={colors.secondary} />
            <View style={styles.statusBannerText}>
              <Text style={[styles.statusBannerTitle, { color: colors.secondary }]}>WiFi Gate is Disabled</Text>
              <Text style={styles.statusBannerSub}>Currently using {activeMethod.replace('_', ' ')}.</Text>
            </View>
            <TouchableOpacity 
              style={styles.enableBtn} 
              onPress={handleSwitchToWifi}
              disabled={switchingMethod}
            >
              {switchingMethod ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.enableBtnText}>Enable</Text>}
            </TouchableOpacity>
          </View>
        )}

        {locations.length === 0 ? (
          <View style={styles.emptyCard}>
            <AlertCircle size={32} color={colors.warning} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No Office Locations Found</Text>
            <Text style={styles.emptySub}>Please create an office location in the Settings tab first.</Text>
          </View>
        ) : (
          <>
            {/* Office Selection */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Select Office Location</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
                {locations.map(loc => (
                  <TouchableOpacity 
                    key={loc._id} 
                    style={[styles.officeChip, selectedOfficeId === loc._id && styles.officeChipActive]}
                    onPress={() => handleOfficeChange(loc._id)}
                  >
                    <MapPin size={16} color={selectedOfficeId === loc._id ? colors.primary : colors.secondary} />
                    <Text style={[styles.officeChipText, selectedOfficeId === loc._id && styles.officeChipTextActive]}>
                      {loc.officeName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Network Signature Scanner */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Zap size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Admin Network Signature</Text>
                </View>
                <TouchableOpacity onPress={handleRefreshNetwork} disabled={refreshing}>
                  <RefreshCw size={18} color={refreshing ? colors.secondary : colors.primary} style={refreshing ? { opacity: 0.5 } : {}} />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardSubtitle}>Your current device's network fingerprint. Add these to the whitelist to approve this network.</Text>

              <View style={styles.networkList}>
                {/* IPv4 */}
                <View style={styles.networkItem}>
                  <View style={styles.networkItemLeft}>
                    <Globe size={16} color={colors.secondary} />
                    <View>
                      <Text style={styles.networkItemLabel}>Public IPv4</Text>
                      <Text style={styles.networkItemValue}>{networkInfo.publicIpv4 || 'Not Detected'}</Text>
                    </View>
                  </View>
                  {networkInfo.publicIpv4 && (
                    <TouchableOpacity 
                      style={[styles.whitelistBtn, isIpv4Allowed && styles.whitelistedBtn]}
                      onPress={() => handleAddWhitelist(networkInfo.publicIpv4)}
                      disabled={isIpv4Allowed}
                    >
                      <Text style={[styles.whitelistBtnText, isIpv4Allowed && styles.whitelistedBtnText]}>
                        {isIpv4Allowed ? 'Whitelisted' : 'Whitelist'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* IPv6 Subnet */}
                {networkInfo.ipv6Subnet && (
                  <View style={styles.networkItem}>
                    <View style={styles.networkItemLeft}>
                      <Network size={16} color={colors.secondary} />
                      <View>
                        <Text style={styles.networkItemLabel}>IPv6 Subnet (/64)</Text>
                        <Text style={styles.networkItemValue}>{networkInfo.ipv6Subnet}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={[styles.whitelistBtn, isIpv6SubnetAllowed && styles.whitelistedBtn]}
                      onPress={() => handleAddWhitelist(networkInfo.ipv6Subnet)}
                      disabled={isIpv6SubnetAllowed}
                    >
                      <Text style={[styles.whitelistBtnText, isIpv6SubnetAllowed && styles.whitelistedBtnText]}>
                        {isIpv6SubnetAllowed ? 'Whitelisted' : 'Whitelist'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            {/* Allowed Configuration */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Shield size={18} color={colors.success} />
                <Text style={styles.sectionTitle}>Allowed Network Config</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Office WiFi SSID (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Corp_Guest_5G"
                  placeholderTextColor="#94a3b8"
                  value={form.wifiSsid}
                  onChangeText={val => setForm(prev => ({ ...prev, wifiSsid: val }))}
                />
                <Text style={styles.helperText}>Matches exact network name. Devices must be connected to this SSID.</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Whitelisted IPs / Subnets</Text>
                {form.allowedIps.length === 0 ? (
                  <View style={styles.emptyIpBox}>
                    <Text style={styles.emptyIpText}>No IP addresses whitelisted.</Text>
                  </View>
                ) : (
                  <View style={styles.tagContainer}>
                    {form.allowedIps.map((ip, idx) => (
                      <View key={`${ip}-${idx}`} style={styles.tag}>
                        <Text style={styles.tagText}>{ip}</Text>
                        <TouchableOpacity onPress={() => handleRemoveWhitelist(ip)}>
                          <AlertCircle size={14} color="#ef4444" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity 
                style={styles.saveBtn} 
                onPress={handleSaveNetwork}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Check size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>Save Network Configuration</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { 
    flexDirection: 'row', alignItems: 'center', padding: 16, 
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border 
  },
  backBtn: { marginRight: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textDark },
  
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  pageSubtitle: { fontSize: 14, color: colors.secondary, marginBottom: 16, lineHeight: 20 },
  
  statusBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  statusBannerText: { flex: 1, marginLeft: 12 },
  statusBannerTitle: { fontSize: 15, fontWeight: '700', color: colors.successDark },
  statusBannerSub: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  enableBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  enableBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  
  emptyCard: { backgroundColor: '#fff', padding: 32, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.secondary, textAlign: 'center' },
  
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textDark },
  cardSubtitle: { fontSize: 13, color: colors.secondary, marginBottom: 16, lineHeight: 18 },
  
  officeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 20, marginRight: 8, gap: 6, borderWidth: 1, borderColor: 'transparent' },
  officeChipActive: { backgroundColor: colors.primaryLight, borderColor: '#99f6e4' },
  officeChipText: { fontSize: 13, fontWeight: '600', color: colors.secondary },
  officeChipTextActive: { color: colors.primaryDark },
  
  networkList: { backgroundColor: '#f8fafc', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9' },
  networkItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  networkItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  networkItemLabel: { fontSize: 11, fontWeight: '600', color: colors.secondary, textTransform: 'uppercase' },
  networkItemValue: { fontSize: 14, fontWeight: '700', color: colors.textDark, marginTop: 2 },
  
  whitelistBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary, borderRadius: 6 },
  whitelistBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  whitelistedBtn: { backgroundColor: '#e2e8f0' },
  whitelistedBtnText: { color: colors.secondary },
  
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textDark, marginBottom: 8 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, color: colors.textDark, fontSize: 15 },
  helperText: { fontSize: 12, color: colors.secondary, marginTop: 6 },
  
  emptyIpBox: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9', borderStyle: 'dashed' },
  emptyIpText: { fontSize: 13, color: colors.secondary },
  
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  tagText: { fontSize: 13, fontWeight: '500', color: colors.textDark },
  
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 10, gap: 8, marginTop: 4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import api from '../lib/api';
import { getDeviceSignals } from '../lib/device';
import { getStabilizedLocation } from '../lib/location';
import { authenticateAndGetBiometricToken, checkBiometricAvailability } from '../lib/biometrics';
import CheckInQrScanner from './CheckInQrScanner';
import * as Network from 'expo-network';

export default function CheckInModal({
  visible,
  onClose,
  dashboard,
  onSuccess,
  initialMethod,
  autoOpenScanner = false,
}) {
  const managerDefault = initialMethod || dashboard?.managerDefaultMethod || dashboard?.activeMethod || 'biometric';
  const allowedMethods = (dashboard?.allowedMethods?.length > 0)
    ? dashboard.allowedMethods
    : ['biometric', 'wifi_ip', 'qr_code'];

  const [activeMethod, setActiveMethod] = useState(managerDefault);
  const [methodAttempts, setMethodAttempts] = useState([]);
  const [fallbackHistory, setFallbackHistory] = useState([]);
  const [fallbackBanner, setFallbackBanner] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  // Network status for WiFi method
  const [networkStatus, setNetworkStatus] = useState(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);

  // Biometric status
  const [biometricInfo, setBiometricInfo] = useState({ supported: false, enrolled: false });

  useEffect(() => {
    if (visible) {
      const chosen = initialMethod || managerDefault;
      setActiveMethod(chosen);
      setMethodAttempts([]);
      setFallbackHistory([]);
      setFallbackBanner(null);
      checkBiometricAvailability().then(setBiometricInfo);
      fetchNetworkStatus();
      if (autoOpenScanner && chosen === 'qr_code') {
        setScannerOpen(true);
      }
    }
  }, [visible, initialMethod, managerDefault, autoOpenScanner]);

  const fetchNetworkStatus = async () => {
    setLoadingNetwork(true);
    try {
      const netState = await Network.getNetworkStateAsync();
      if (netState.type === Network.NetworkStateType.CELLULAR) {
        setNetworkStatus({ 
          isOfficeNetwork: false, 
          error: 'You are on Mobile Data. Please connect to Office Wi-Fi.' 
        });
        setLoadingNetwork(false);
        return;
      }

      const res = await api.get('/employee/network-status');
      if (res.data?.success) {
        setNetworkStatus(res.data.data);
      }
    } catch {
      // Ignore network status fetch error
    } finally {
      setLoadingNetwork(false);
    }
  };

  const executeCheckInApi = async (method, extraPayload = {}) => {
    setLoading(true);
    setLoadingMsg('Acquiring high-accuracy GPS fix...');

    try {
      const loc = await getStabilizedLocation();
      const device = await getDeviceSignals();

      setLoadingMsg('Submitting attendance verification to server...');
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        timestamp: loc.timestamp,
        deviceFingerprint: device.deviceFingerprint,
        checkInMethod: method,
        methodAttempts,
        ...extraPayload,
      };

      const res = await api.post('/employee/attendance/check-in', payload);

      if (res.data?.success) {
        Alert.alert('Attendance Marked', '✅ You have checked in successfully!');
        onSuccess?.();
        onClose();
      } else {
        throw new Error(res.data?.message || 'Check-in failed');
      }
    } catch (err) {
      const rawMsg = err.response?.data?.message || err.message || 'Check-in failed.';
      handleMethodFailure(method, rawMsg);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  /**
   * 3-Tier Cascade Fallback Logic (Biometric -> Wi-Fi -> QR)
   */
  const handleMethodFailure = (failedMethod, reason) => {
    const updatedAttempts = [
      ...methodAttempts,
      {
        method: failedMethod,
        status: 'failed',
        reason,
        timestamp: new Date().toISOString(),
      },
    ];
    setMethodAttempts(updatedAttempts);

    if (failedMethod === 'biometric') {
      // Cascade to WiFi if allowed
      if (!fallbackHistory.includes('wifi_ip') && allowedMethods.includes('wifi_ip')) {
        setFallbackHistory((prev) => [...prev, 'biometric']);
        setActiveMethod('wifi_ip');
        setFallbackBanner("⚠️ Biometric verification failed or was cancelled. Automatically switched you to Office WiFi.");
        return;
      }
      // Cascade to QR
      if (!fallbackHistory.includes('qr_code') && allowedMethods.includes('qr_code')) {
        setFallbackHistory((prev) => [...prev, 'biometric', 'wifi_ip']);
        setActiveMethod('qr_code');
        setFallbackBanner("⚠️ Biometric verification failed. Automatically switched you to Office QR Code.");
        return;
      }
    } else if (failedMethod === 'wifi_ip') {
      // Cascade to QR
      if (!fallbackHistory.includes('qr_code') && allowedMethods.includes('qr_code')) {
        setFallbackHistory((prev) => [...prev, 'wifi_ip']);
        setActiveMethod('qr_code');
        setFallbackBanner("⚠️ Office WiFi verification failed. Automatically switched you to Office QR Code.");
        return;
      }
    }

    // If no fallback left, display the error alert
    Alert.alert('Check-In Verification Failed', reason);
  };

  const handleBiometricCheckIn = async () => {
    setLoading(true);
    setLoadingMsg('Authenticating biometrics...');

    try {
      const { biometricToken } = await authenticateAndGetBiometricToken();
      await executeCheckInApi('biometric', { biometricToken });
    } catch (err) {
      setLoading(false);
      setLoadingMsg('');
      handleMethodFailure('biometric', err.message);
    }
  };

  const handleWifiCheckIn = async () => {
    await executeCheckInApi('wifi_ip');
  };

  const handleQrScanned = async (qrCodeValue) => {
    setScannerOpen(false);
    await executeCheckInApi('qr_code', { qrCodeValue });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>Mark Attendance</Text>
              <Text style={styles.subText}>Select verification method</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={loading}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Fallback Notification Banner */}
          {fallbackBanner && (
            <View style={styles.fallbackBanner}>
              <Text style={styles.fallbackBannerText}>{fallbackBanner}</Text>
            </View>
          )}

          {/* Method Selector Tabs */}
          <View style={styles.methodTabsRow}>
            {allowedMethods.includes('biometric') && (
              <TouchableOpacity
                style={[
                  styles.methodTab,
                  activeMethod === 'biometric' && styles.methodTabActive,
                ]}
                onPress={() => setActiveMethod('biometric')}
                disabled={loading}
              >
                <Text style={styles.methodTabIcon}>👆</Text>
                <Text
                  style={[
                    styles.methodTabLabel,
                    activeMethod === 'biometric' && styles.methodTabLabelActive,
                  ]}
                >
                  Biometric
                </Text>
              </TouchableOpacity>
            )}

            {allowedMethods.includes('wifi_ip') && (
              <TouchableOpacity
                style={[
                  styles.methodTab,
                  activeMethod === 'wifi_ip' && styles.methodTabActive,
                ]}
                onPress={() => setActiveMethod('wifi_ip')}
                disabled={loading}
              >
                <Text style={styles.methodTabIcon}>📶</Text>
                <Text
                  style={[
                    styles.methodTabLabel,
                    activeMethod === 'wifi_ip' && styles.methodTabLabelActive,
                  ]}
                >
                  Office WiFi
                </Text>
              </TouchableOpacity>
            )}

            {allowedMethods.includes('qr_code') && (
              <TouchableOpacity
                style={[
                  styles.methodTab,
                  activeMethod === 'qr_code' && styles.methodTabActive,
                ]}
                onPress={() => setActiveMethod('qr_code')}
                disabled={loading}
              >
                <Text style={styles.methodTabIcon}>📷</Text>
                <Text
                  style={[
                    styles.methodTabLabel,
                    activeMethod === 'qr_code' && styles.methodTabLabelActive,
                  ]}
                >
                  Office QR
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Method Content Panel */}
          <ScrollView style={styles.methodBody}>
            {activeMethod === 'biometric' && (
              <View style={styles.methodPanel}>
                <View style={styles.iconCircle}>
                  <Text style={styles.largeIcon}>👆</Text>
                </View>
                <Text style={styles.panelTitle}>Fingerprint or Face ID</Text>
                <Text style={styles.panelDescription}>
                  Verify your identity using your device's native biometric sensor or device PIN.
                </Text>

                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    {biometricInfo.supported
                      ? biometricInfo.enrolled
                        ? '✅ Sensor ready and enrolled'
                        : '⚠️ No biometrics enrolled on device'
                      : '⚠️ Sensor not supported on device'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.biometricBtn]}
                  onPress={handleBiometricCheckIn}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.actionBtnText}>Verify & Check In</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {activeMethod === 'wifi_ip' && (
              <View style={styles.methodPanel}>
                <View style={[styles.iconCircle, styles.wifiCircle]}>
                  <Text style={styles.largeIcon}>📶</Text>
                </View>
                <Text style={styles.panelTitle}>Office Network Gateway</Text>
                <Text style={styles.panelDescription}>
                  Verifies that your device is connected to the authorized office Wi-Fi network and within office geofence.
                </Text>

                <View style={styles.networkCard}>
                  <View style={styles.networkRow}>
                    <Text style={styles.networkKey}>Target Network:</Text>
                    <Text style={styles.networkVal}>
                      {networkStatus?.targetSsid || 'Spheronix Office WiFi'}
                    </Text>
                  </View>
                  <View style={styles.networkRow}>
                    <Text style={styles.networkKey}>Status:</Text>
                    <Text
                      style={[
                        styles.networkVal,
                        { color: networkStatus?.error ? '#dc2626' : (networkStatus?.isOfficeNetwork ? '#059669' : '#d97706') },
                      ]}
                    >
                      {loadingNetwork
                        ? 'Checking...'
                        : networkStatus?.error
                        ? networkStatus.error
                        : networkStatus?.isOfficeNetwork
                        ? 'Connected to Office Network'
                        : 'Checking server egress IP'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.wifiBtn]}
                  onPress={handleWifiCheckIn}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.actionBtnText}>Verify WiFi & Check In</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {activeMethod === 'qr_code' && (
              <View style={styles.methodPanel}>
                <View style={[styles.iconCircle, styles.qrCircle]}>
                  <Text style={styles.largeIcon}>📷</Text>
                </View>
                <Text style={styles.panelTitle}>Office Dynamic QR Code</Text>
                <Text style={styles.panelDescription}>
                  Scan today's live encrypted QR code displayed on the office entrance display screen.
                </Text>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.qrBtn]}
                  onPress={() => setScannerOpen(true)}
                  disabled={loading}
                >
                  <Text style={styles.actionBtnText}>Open Camera Scanner</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && Boolean(loadingMsg) && (
              <View style={styles.loadingStateBox}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.loadingStateText}>{loadingMsg}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {/* QR Scanner Fullscreen Modal */}
      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <CheckInQrScanner
          onScan={handleQrScanned}
          onClose={() => setScannerOpen(false)}
        />
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  subText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: 'bold',
  },
  fallbackBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  fallbackBannerText: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
    lineHeight: 16,
  },
  methodTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  methodTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  methodTabIcon: {
    fontSize: 14,
  },
  methodTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  methodTabLabelActive: {
    color: '#4338ca',
    fontWeight: '700',
  },
  methodBody: {
    paddingBottom: 20,
  },
  methodPanel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  wifiCircle: {
    backgroundColor: '#f0fdf4',
  },
  qrCircle: {
    backgroundColor: '#faf5ff',
  },
  largeIcon: {
    fontSize: 30,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  panelDescription: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 18,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  networkCard: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    gap: 8,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  networkKey: {
    fontSize: 12,
    color: '#64748b',
  },
  networkVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  actionBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricBtn: {
    backgroundColor: '#4f46e5',
  },
  wifiBtn: {
    backgroundColor: '#059669',
  },
  qrBtn: {
    backgroundColor: '#7c3aed',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingStateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  loadingStateText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
  },
});

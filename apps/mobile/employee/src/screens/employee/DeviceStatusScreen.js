import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { ArrowLeft, Home } from 'lucide-react-native';
import api from '../../lib/api';
import { getDeviceFingerprint, getDeviceContext } from '../../lib/device';
import { useSocket } from '../../contexts/SocketContext';

const STATUS_CONFIG = {
  active: { label: 'Trusted Device', color: '#10b981', bg: '#ecfdf5', dot: '#10b981' },
  temporary: { label: 'Temporary Device', color: '#f59e0b', bg: '#fffbeb', dot: '#f59e0b' },
  pending: { label: 'Pending Approval', color: '#0ea5e9', bg: '#f0f9ff', dot: '#0ea5e9' },
  none: { label: 'No Device Bound', color: '#ef4444', bg: '#fef2f2', dot: '#ef4444' },
};

const PRESET_REASONS = {
  temporary: ['Forgot primary phone', 'Phone battery depleted', 'Phone temporarily broken', 'Other reason'],
  replacement: ['Upgraded to new phone', 'Old device permanently damaged', 'Phone lost / stolen', 'Other reason'],
  lost: ['Phone lost in transit', 'Phone stolen', 'Other reason'],
};

export default function DeviceStatusScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [currentFp, setCurrentFp] = useState('');
  const [currentDeviceLabel, setCurrentDeviceLabel] = useState('');

  // Request Form Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [requestType, setRequestType] = useState('replacement'); // 'temporary' | 'replacement' | 'lost'
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [requestedUntil, setRequestedUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { socket } = useSocket();

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [statusRes, requestsRes, fp, devInfo] = await Promise.all([
        api.get('/employee/device-status'),
        api.get('/employee/device-requests'),
        getDeviceFingerprint(),
        getDeviceContext(),
      ]);

      setDeviceStatus(statusRes.data.data.deviceStatus);
      setPendingRequest(statusRes.data.data.pendingRequest);
      setMyRequests(requestsRes.data.data.requests || []);
      setCurrentFp(fp);
      setCurrentDeviceLabel(`${devInfo.deviceModel || 'Android'} (${devInfo.osVersion || 'Android'})`);
    } catch (err) {
      console.error('Failed to load device status:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to load device status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Real-time socket updates for device request resolution
  useEffect(() => {
    if (!socket) return;
    const onResolved = (data) => {
      fetchStatus(true);
      if (data.action === 'approve') {
        Alert.alert('Device Approved', 'Your device request has been approved by your manager!');
      } else if (data.action === 'reject') {
        Alert.alert('Device Request Rejected', `Note: ${data.decisionNote || 'No explanation provided'}`);
      }
    };
    socket.on('device:request_resolved', onResolved);
    return () => {
      socket.off('device:request_resolved', onResolved);
    };
  }, [socket, fetchStatus]);

  const handleSubmitRequest = async () => {
    const finalReason = selectedReason === 'Other reason' ? customReason : selectedReason;
    if (!finalReason.trim()) {
      Alert.alert('Reason Required', 'Please choose or provide an explanation.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        requestType,
        reason: finalReason.trim(),
        deviceFingerprint: currentFp,
        requestedDeviceLabel: currentDeviceLabel,
      };

      if (requestType === 'temporary' && requestedUntil) {
        payload.requestedUntil = new Date(requestedUntil).toISOString();
      }

      await api.post('/employee/device-requests', payload);

      Alert.alert(
        'Request Submitted',
        requestType === 'lost'
          ? 'Your device was marked as lost. A replacement request was sent to your manager.'
          : `${requestType === 'temporary' ? 'Temporary device' : 'Device replacement'} request submitted for approval.`
      );

      setModalVisible(false);
      setSelectedReason('');
      setCustomReason('');
      setRequestedUntil('');
      fetchStatus(true);
    } catch (err) {
      console.error('Device request error:', err);
      Alert.alert('Request Failed', err.response?.data?.message || 'Failed to submit device request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Checking Device Hardware Binding...</Text>
      </View>
    );
  }

  const statusType = deviceStatus?.statusType || 'none';
  const cfg = STATUS_CONFIG[statusType] || STATUS_CONFIG.none;
  const boundDevice = deviceStatus?.device;

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backHomeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Back to Home Dashboard"
            >
              <ArrowLeft size={16} color="#0f172a" />
              <Text style={styles.backHomeBtnText}>Back to Home</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.homeCircleBtn}
              activeOpacity={0.7}
              accessibilityLabel="Home Dashboard"
            >
              <Home size={16} color="#0284c7" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Device Security</Text>
            <Text style={styles.headerSubtitle}>Hardware binding & trusted authorization</Text>
          </View>
          <TouchableOpacity
            style={styles.requestActionBtn}
            onPress={() => {
              setSelectedReason(PRESET_REASONS.replacement[0]);
              setModalVisible(true);
            }}
          >
            <Text style={styles.requestActionBtnText}>+ Request Change</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStatus()} />}
      >
        {/* Current Binding Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusCardHeader}>
            <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>

          <Text style={styles.boundLabel}>
            {boundDevice?.deviceLabel || currentDeviceLabel || 'Unknown Mobile Device'}
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Binding Status:</Text>
            <Text style={styles.infoVal}>{statusType.toUpperCase()}</Text>
          </View>

          {boundDevice?.registeredAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Bound Since:</Text>
              <Text style={styles.infoVal}>
                {new Date(boundDevice.registeredAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          )}

          {statusType === 'temporary' && boundDevice?.temporaryUntil && (
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Valid Until:</Text>
              <Text style={[styles.infoVal, { color: '#d97706' }]}>
                {new Date(boundDevice.temporaryUntil).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* Local Hardware Signals Card */}
        <View style={styles.hardwareCard}>
          <Text style={styles.hardwareCardTitle}>This Phone's Hardware Signature</Text>
          <Text style={styles.hardwareCardSub}>
            Cryptographically derived from native Android hardware parameters.
          </Text>

          <View style={styles.fingerprintBox}>
            <Text style={styles.fingerprintLabel}>Fingerprint SHA-256 Hash:</Text>
            <Text style={styles.fingerprintValue} numberOfLines={2}>
              {currentFp || 'Generating...'}
            </Text>
          </View>
        </View>

        {/* Pending Request Banner */}
        {pendingRequest && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingBadge}>PENDING REVIEW</Text>
            <Text style={styles.pendingTitle}>
              {pendingRequest.requestType?.toUpperCase()} Device Request
            </Text>
            <Text style={styles.pendingReason}>"{pendingRequest.reason}"</Text>
            <Text style={styles.pendingSub}>
              Submitted {new Date(pendingRequest.createdAt).toLocaleDateString()} • Awaiting manager decision
            </Text>
          </View>
        )}

        {/* Past Requests History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Device Request History ({myRequests.length})</Text>
          {myRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No device change requests found.</Text>
            </View>
          ) : (
            myRequests.map((req) => (
              <View key={req._id} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <Text style={styles.historyType}>
                    {req.requestType?.toUpperCase()} DEVICE
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          req.status === 'approved'
                            ? '#dcfce7'
                            : req.status === 'rejected'
                            ? '#fee2e2'
                            : '#fef3c7',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color:
                            req.status === 'approved'
                              ? '#16a34a'
                              : req.status === 'rejected'
                              ? '#dc2626'
                              : '#d97706',
                        },
                      ]}
                    >
                      {req.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.historyReason}>{req.reason}</Text>
                {req.decisionNote && (
                  <Text style={styles.historyNote}>Manager Note: {req.decisionNote}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Bottom Back to Home Button */}
        {onBack && (
          <TouchableOpacity
            style={styles.bottomBackBtn}
            activeOpacity={0.8}
            onPress={onBack}
          >
            <Home size={16} color="#334155" />
            <Text style={styles.bottomBackBtnText}>Back to Home Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Request Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Device Change</Text>
            <Text style={styles.modalSubtitle}>
              Request to bind this phone as your trusted or temporary punch device.
            </Text>

            {/* Type selector */}
            <Text style={styles.formLabel}>Request Type *</Text>
            <View style={styles.typeTabs}>
              {[
                { key: 'replacement', label: 'Permanent' },
                { key: 'temporary', label: 'Temporary' },
                { key: 'lost', label: 'Lost Phone' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeTab, requestType === t.key && styles.typeTabActive]}
                  onPress={() => {
                    setRequestType(t.key);
                    setSelectedReason(PRESET_REASONS[t.key]?.[0] || '');
                  }}
                >
                  <Text style={[styles.typeTabText, requestType === t.key && styles.typeTabTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preset reasons */}
            <Text style={styles.formLabel}>Reason *</Text>
            <View style={styles.reasonsList}>
              {(PRESET_REASONS[requestType] || []).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonOption, selectedReason === r && styles.reasonOptionActive]}
                  onPress={() => setSelectedReason(r)}
                >
                  <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextActive]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedReason === 'Other reason' && (
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Explain the circumstance..."
                multiline
                numberOfLines={2}
              />
            )}

            {/* Temporary Date Picker Input */}
            {requestType === 'temporary' && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.formLabel}>Valid Until (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={requestedUntil}
                  onChangeText={setRequestedUntil}
                  placeholder="2026-09-30"
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                disabled={submitting}
                onPress={handleSubmitRequest}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backHomeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  homeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 18,
    marginBottom: 20,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  requestActionBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  requestActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  boundLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  infoKey: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  hardwareCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 14,
  },
  hardwareCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  hardwareCardSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 12,
  },
  fingerprintBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fingerprintLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  fingerprintValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6366f1',
  },
  pendingCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 14,
  },
  pendingBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    marginBottom: 4,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369a1',
  },
  pendingReason: {
    fontSize: 12,
    color: '#075985',
    marginVertical: 4,
    fontStyle: 'italic',
  },
  pendingSub: {
    fontSize: 10,
    color: '#38bdf8',
  },
  historySection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyType: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  historyReason: {
    fontSize: 12,
    color: '#475569',
  },
  historyNote: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  typeTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  typeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  typeTabActive: {
    backgroundColor: '#ffffff',
  },
  typeTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  typeTabTextActive: {
    color: '#6366f1',
    fontWeight: '800',
  },
  reasonsList: {
    gap: 6,
    marginBottom: 12,
  },
  reasonOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  reasonOptionActive: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  reasonText: {
    fontSize: 12,
    color: '#475569',
  },
  reasonTextActive: {
    color: '#6366f1',
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  textArea: {
    height: 60,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalSubmitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

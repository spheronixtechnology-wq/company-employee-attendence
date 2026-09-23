import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Home } from 'lucide-react-native';
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
import api from '../../lib/api';
import { useSocket } from '../../contexts/SocketContext';

const STATUS_CONFIG = {
  permission_pending: { label: 'Permission Pending', color: '#d97706', bg: '#fef3c7' },
  permission_approved: { label: 'Ready to Start', color: '#16a34a', bg: '#dcfce7' },
  permission_rejected: { label: 'Permission Rejected', color: '#dc2626', bg: '#fee2e2' },
  in_progress: { label: 'In Progress', color: '#ea580c', bg: '#ffedd5' },
  work_verification_pending: { label: 'Verification Pending', color: '#2563eb', bg: '#dbeafe' },
  completed_approved: { label: 'Approved & Logged', color: '#059669', bg: '#d1fae5' },
  work_rejected: { label: 'Work Rejected', color: '#b91c1c', bg: '#fee2e2' },
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
};

export default function OvertimeScreen({ onBack }) {
  const { socket } = useSocket();
  const [data, setData] = useState({ records: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [tabFilter, setTabFilter] = useState('all');

  // Request Modal State (Stage 1)
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [requestStartTime, setRequestStartTime] = useState('18:30');
  const [requestEndTime, setRequestEndTime] = useState('20:30');
  const [requestReason, setRequestReason] = useState('');

  // Finish Modal State (Stage 2)
  const [finishModalVisible, setFinishModalVisible] = useState(false);
  const [workDetails, setWorkDetails] = useState('');

  // Detail Modal
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Live Timer for Active Session
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fetchOvertime = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get('/employee/overtime/me');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch overtime records:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to load overtime records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOvertime();
  }, [fetchOvertime]);

  // Real-time sync: manager resolves overtime permission or work verification
  useEffect(() => {
    if (!socket) return;

    const onPermissionResolved = (data) => {
      fetchOvertime(true);
      const approved = data?.status === 'permission_approved';
      Alert.alert(
        approved ? '✅ Overtime Approved' : '❌ Overtime Rejected',
        approved
          ? 'Your overtime permission request has been approved. You can now start your session.'
          : `Your overtime request was rejected.${data?.notes ? ` Note: ${data.notes}` : ''}`
      );
    };

    const onWorkResolved = (data) => {
      fetchOvertime(true);
      const approved = data?.status === 'completed_approved';
      Alert.alert(
        approved ? '✅ Overtime Logged' : '❌ Work Rejected',
        approved
          ? 'Your overtime work has been verified and approved ✅.'
          : `Your overtime work submission was not approved.${data?.notes ? ` Note: ${data.notes}` : ''}`
      );
    };

    socket.on('overtime:permission_resolved', onPermissionResolved);
    socket.on('overtime:work_resolved', onWorkResolved);

    return () => {
      socket.off('overtime:permission_resolved', onPermissionResolved);
      socket.off('overtime:work_resolved', onWorkResolved);
    };
  }, [socket, fetchOvertime]);

  const activeSession = data.stats?.activeSession;
  const permittedSession = data.stats?.permittedSession;

  // Active Session Live Stopwatch
  useEffect(() => {
    if (!activeSession?.actualStartTime) {
      setElapsedSeconds(0);
      return;
    }

    const startTs = new Date(activeSession.actualStartTime).getTime();
    const update = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startTs) / 1000)));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const formatElapsed = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Submit Stage 1 Permission Request
  const handleRequestSubmit = async () => {
    if (!requestReason.trim()) {
      Alert.alert('Missing Reason', 'Please provide a clear reason for the overtime request.');
      return;
    }

    setActionLoading('request');
    try {
      const startIso = new Date(`${requestDate}T${requestStartTime}:00`).toISOString();
      const endIso = new Date(`${requestDate}T${requestEndTime}:00`).toISOString();

      await api.post('/employee/overtime/request', {
        date: requestDate,
        requestedStartTime: startIso,
        requestedEndTime: endIso,
        reason: requestReason.trim(),
      });

      Alert.alert('Success', 'Overtime permission request submitted to your manager (Stage 1).');
      setRequestModalVisible(false);
      setRequestReason('');
      fetchOvertime(true);
    } catch (err) {
      Alert.alert('Request Failed', err.response?.data?.message || 'Failed to submit overtime request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Start OT Session (Stage 1 Approved)
  const handleStartSession = async (sessionId) => {
    setActionLoading(`start_${sessionId}`);
    try {
      await api.post(`/employee/overtime/${sessionId}/start`);
      Alert.alert('Session Started', 'Overtime session started! Your focus time is now being recorded.');
      fetchOvertime(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to start overtime session.');
    } finally {
      setActionLoading(null);
    }
  };

  // Finish OT Session & Submit Work (Stage 2)
  const handleFinishSession = async () => {
    if (!workDetails.trim()) {
      Alert.alert('Missing Work Details', 'Please describe the work completed during this session.');
      return;
    }

    if (!activeSession) return;

    setActionLoading('finish');
    try {
      await api.post(`/employee/overtime/${activeSession._id}/end`, {
        workDetails: workDetails.trim(),
      });

      Alert.alert('Work Submitted', 'Overtime session finished and work submitted for manager verification (Stage 2).');
      setFinishModalVisible(false);
      setWorkDetails('');
      fetchOvertime(true);
    } catch (err) {
      Alert.alert('Finish Failed', err.response?.data?.message || 'Failed to finish overtime session.');
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel Request
  const handleCancelRequest = (sessionId) => {
    Alert.alert(
      'Cancel Overtime Request',
      'Are you sure you want to cancel this overtime request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(`cancel_${sessionId}`);
            try {
              await api.post(`/employee/overtime/${sessionId}/cancel`);
              Alert.alert('Cancelled', 'Overtime request cancelled.');
              fetchOvertime(true);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to cancel overtime request.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    const list = data.records || [];
    if (tabFilter === 'pending') {
      return list.filter((r) => ['permission_pending', 'work_verification_pending'].includes(r.status));
    }
    if (tabFilter === 'approved') {
      return list.filter((r) => r.status === 'completed_approved');
    }
    if (tabFilter === 'active') {
      return list.filter((r) => ['permission_approved', 'in_progress'].includes(r.status));
    }
    return list;
  }, [data.records, tabFilter]);

  const stats = data.stats || {};

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Overtime Records...</Text>
      </View>
    );
  }

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
            <Text style={styles.headerTitle}>Overtime</Text>
            <Text style={styles.headerSubtitle}>Two-Stage Approval Workflow</Text>
          </View>
          <TouchableOpacity
            style={styles.requestButton}
            onPress={() => setRequestModalVisible(true)}
          >
            <Text style={styles.requestButtonText}>+ Request OT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOvertime()} />}
      >
        {/* Active Session Live Ticking Stopwatch Banner */}
        {activeSession && (
          <View style={styles.activeBanner}>
            <View style={styles.activeBannerHeader}>
              <View style={styles.liveBadge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveBadgeText}>LIVE FOCUS SESSION</Text>
              </View>
              <Text style={styles.activeDateText}>{activeSession.date}</Text>
            </View>

            <Text style={styles.liveTimerText}>{formatElapsed(elapsedSeconds)}</Text>
            <Text style={styles.activeReasonText} numberOfLines={1}>
              {activeSession.reason}
            </Text>

            <TouchableOpacity
              style={styles.finishButton}
              onPress={() => setFinishModalVisible(true)}
            >
              <Text style={styles.finishButtonText}>Finish & Submit Work (Stage 2)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Permitted Session Banner (Stage 1 Approved, Ready to Start) */}
        {!activeSession && permittedSession && (
          <View style={styles.permittedBanner}>
            <View style={styles.permittedHeader}>
              <Text style={styles.permittedBadge}>PERMISSION APPROVED</Text>
              <Text style={styles.permittedDateText}>{permittedSession.date}</Text>
            </View>
            <Text style={styles.permittedTitle}>Ready to start your approved overtime session</Text>
            <Text style={styles.permittedReasonText} numberOfLines={2}>
              "{permittedSession.reason}"
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              disabled={actionLoading === `start_${permittedSession._id}`}
              onPress={() => handleStartSession(permittedSession._id)}
            >
              {actionLoading === `start_${permittedSession._id}` ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.startButtonText}>▶ Start Live Focus Timer</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 4 KPI Tiles Ribbon */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiTile, { borderLeftColor: '#10b981' }]}>
            <Text style={styles.kpiValue}>{stats.totalApprovedFormatted || '0h 00m'}</Text>
            <Text style={styles.kpiLabel}>Approved OT</Text>
            <Text style={styles.kpiSubtext}>Verified by Manager</Text>
          </View>

          <View style={[styles.kpiTile, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.kpiValue}>{stats.totalRecordedFormatted || '0h 00m'}</Text>
            <Text style={styles.kpiLabel}>Recorded (Actual)</Text>
            <Text style={styles.kpiSubtext}>Completed Shifts</Text>
          </View>

          <View style={[styles.kpiTile, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.kpiValue}>
              {activeSession ? 'In Progress' : permittedSession ? 'Permitted' : 'Idle'}
            </Text>
            <Text style={styles.kpiLabel}>Current Status</Text>
            <Text style={styles.kpiSubtext}>
              {activeSession ? 'Tracking Live' : permittedSession ? 'Ready to Start' : 'No Active Session'}
            </Text>
          </View>

          <View style={[styles.kpiTile, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.kpiValue}>{stats.pendingTotal || 0}</Text>
            <Text style={styles.kpiLabel}>Pending Approvals</Text>
            <Text style={styles.kpiSubtext}>Awaiting Manager</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active / Ready' },
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, tabFilter === tab.key && styles.filterTabActive]}
              onPress={() => setTabFilter(tab.key)}
            >
              <Text style={[styles.filterTabText, tabFilter === tab.key && styles.filterTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Records List */}
        <View style={styles.recordsSection}>
          <Text style={styles.sectionTitle}>
            History & Requests ({filteredRecords.length})
          </Text>

          {filteredRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⏱</Text>
              <Text style={styles.emptyTitle}>No overtime records found</Text>
              <Text style={styles.emptySubtitle}>
                {tabFilter === 'all'
                  ? 'Request permission before starting overtime work.'
                  : `No records matching the "${tabFilter}" filter.`}
              </Text>
            </View>
          ) : (
            filteredRecords.map((item) => {
              const cfg = STATUS_CONFIG[item.status] || {
                label: item.status,
                color: '#64748b',
                bg: '#f1f5f9',
              };
              return (
                <TouchableOpacity
                  key={item._id}
                  style={styles.recordCard}
                  onPress={() => setSelectedRecord(item)}
                >
                  <View style={styles.recordCardHeader}>
                    <Text style={styles.recordDate}>{item.date}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.recordReason} numberOfLines={2}>
                    {item.reason}
                  </Text>

                  {item.actualMinutes > 0 && (
                    <Text style={styles.actualTimeText}>
                      Recorded: {Math.floor(item.actualMinutes / 60)}h{' '}
                      {(item.actualMinutes % 60).toString().padStart(2, '0')}m
                    </Text>
                  )}

                  <View style={styles.recordActions}>
                    {item.status === 'permission_approved' && (
                      <TouchableOpacity
                        style={styles.smallStartBtn}
                        onPress={() => handleStartSession(item._id)}
                      >
                        <Text style={styles.smallStartBtnText}>▶ Start Session</Text>
                      </TouchableOpacity>
                    )}

                    {item.status === 'permission_pending' && (
                      <TouchableOpacity
                        style={styles.smallCancelBtn}
                        onPress={() => handleCancelRequest(item._id)}
                      >
                        <Text style={styles.smallCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
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

      {/* Stage 1: Request Modal */}
      <Modal visible={requestModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Overtime Permission</Text>
            <Text style={styles.modalSubtitle}>
              Stage 1: Manager permission is required before working overtime.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={requestDate}
                onChangeText={setRequestDate}
                placeholder="2026-09-21"
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.formLabel}>Start (HH:MM)</Text>
                <TextInput
                  style={styles.textInput}
                  value={requestStartTime}
                  onChangeText={setRequestStartTime}
                  placeholder="18:30"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>End (HH:MM)</Text>
                <TextInput
                  style={styles.textInput}
                  value={requestEndTime}
                  onChangeText={setRequestEndTime}
                  placeholder="20:30"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Reason for Overtime *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={requestReason}
                onChangeText={setRequestReason}
                placeholder="Explain the critical tasks requiring extended hours..."
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRequestModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                disabled={actionLoading === 'request'}
                onPress={handleRequestSubmit}
              >
                {actionLoading === 'request' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stage 2: Finish Session & Submit Work Modal */}
      <Modal visible={finishModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finish Overtime Session</Text>
            <Text style={styles.modalSubtitle}>
              Stage 2: Submit work details for manager verification.
            </Text>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxLabel}>Focus Time Completed</Text>
              <Text style={styles.summaryBoxValue}>{formatElapsed(elapsedSeconds)}</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Work Details Completed *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={workDetails}
                onChangeText={setWorkDetails}
                placeholder="Describe features completed, bug fixes merged, or tasks delivered..."
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setFinishModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                disabled={actionLoading === 'finish'}
                onPress={handleFinishSession}
              >
                {actionLoading === 'finish' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Finish & Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Details Modal */}
      <Modal visible={!!selectedRecord} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Overtime Details</Text>
            {selectedRecord && (
              <ScrollView style={{ maxHeight: 320 }}>
                <Text style={styles.detailLabel}>Date:</Text>
                <Text style={styles.detailValue}>{selectedRecord.date}</Text>

                <Text style={styles.detailLabel}>Status:</Text>
                <Text style={styles.detailValue}>
                  {STATUS_CONFIG[selectedRecord.status]?.label || selectedRecord.status}
                </Text>

                <Text style={styles.detailLabel}>Reason:</Text>
                <Text style={styles.detailValue}>{selectedRecord.reason}</Text>

                {selectedRecord.workDetails && (
                  <>
                    <Text style={styles.detailLabel}>Work Delivered (Stage 2):</Text>
                    <Text style={styles.detailValue}>{selectedRecord.workDetails}</Text>
                  </>
                )}

                {selectedRecord.rejectionReason && (
                  <>
                    <Text style={[styles.detailLabel, { color: '#dc2626' }]}>Manager Note / Rejection:</Text>
                    <Text style={[styles.detailValue, { color: '#dc2626' }]}>
                      {selectedRecord.rejectionReason}
                    </Text>
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { marginTop: 16 }]}
              onPress={() => setSelectedRecord(null)}
            >
              <Text style={styles.modalSubmitBtnText}>Close</Text>
            </TouchableOpacity>
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
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
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
  requestButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  requestButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  activeBanner: {
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#fdba74',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ea580c',
    marginRight: 6,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c2410c',
  },
  activeDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9a3412',
  },
  liveTimerText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#ea580c',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginVertical: 8,
  },
  activeReasonText: {
    fontSize: 12,
    color: '#7c2d12',
    textAlign: 'center',
    marginBottom: 14,
    fontStyle: 'italic',
  },
  finishButton: {
    backgroundColor: '#ea580c',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  permittedBanner: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#86efac',
    padding: 16,
    marginBottom: 16,
  },
  permittedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permittedBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  permittedDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  permittedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14532d',
    marginBottom: 4,
  },
  permittedReasonText: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  kpiSubtext: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  filterTabTextActive: {
    color: '#6366f1',
    fontWeight: '800',
  },
  recordsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  recordCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recordDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  recordReason: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  actualTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 6,
  },
  recordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  smallStartBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallStartBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  smallCancelBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallCancelBtnText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
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
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
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
    height: 80,
    textAlignVertical: 'top',
  },
  summaryBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryBoxLabel: {
    fontSize: 11,
    color: '#9a3412',
    fontWeight: '600',
  },
  summaryBoxValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ea580c',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
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
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 10,
  },
  detailValue: {
    fontSize: 13,
    color: '#0f172a',
    marginTop: 2,
    lineHeight: 18,
  },
});

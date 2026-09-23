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
import { useSocket } from '../../contexts/SocketContext';

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', color: '#d97706', bg: '#fef3c7' },
  approved: { label: 'Approved', color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
};

export default function LeaveScreen({ onBack }) {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Apply Modal Form
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');

  const { socket } = useSocket();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [balRes, reqRes, typesRes] = await Promise.all([
        api.get('/employee/leave/balance'),
        api.get('/employee/leave/requests/me'),
        api.get('/employee/leave/types').catch(() => null),
      ]);

      const bals = balRes.data?.data?.balances || [];
      setBalances(bals);
      setRequests(reqRes.data?.data?.requests || []);

      const typesFromApi = typesRes?.data?.data?.leaveTypes || balRes.data?.data?.leaveTypes;
      if (typesFromApi && typesFromApi.length > 0) {
        setLeaveTypes(typesFromApi);
      } else if (bals.length > 0) {
        setLeaveTypes(
          bals
            .filter((b) => b.leaveTypeId && b.leaveTypeId._id)
            .map((b) => ({
              _id: b.leaveTypeId._id,
              name: b.leaveTypeId.name,
              code: b.leaveTypeId.code,
            }))
        );
      }
    } catch (err) {
      console.error('Failed to load leave data:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to load leave balances.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time socket updates for manager decisions
  useEffect(() => {
    if (!socket) return;
    const onResolved = (data) => {
      fetchData(true);
      Alert.alert(
        'Leave Request Updated',
        `Your leave request status is now: ${data.status || 'Updated'}`
      );
    };
    socket.on('leave:request_resolved', onResolved);
    return () => {
      socket.off('leave:request_resolved', onResolved);
    };
  }, [socket, fetchData]);

  const handleApply = async () => {
    if (!selectedLeaveTypeId) {
      Alert.alert('Selection Required', 'Please select a leave category.');
      return;
    }
    if (!startDate || !endDate) {
      Alert.alert('Dates Required', 'Please select both start date and end date.');
      return;
    }
    if (endDate < startDate) {
      Alert.alert('Invalid Date Range', 'End date cannot precede the start date.');
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      Alert.alert('Reason Required', 'Please enter a clear reason (minimum 3 characters).');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/employee/leave/apply', {
        leaveTypeId: selectedLeaveTypeId,
        startDate,
        endDate,
        reason: reason.trim(),
      });

      Alert.alert('Success', 'Leave application submitted to your manager.');
      setModalVisible(false);
      setReason('');
      fetchData(true);
    } catch (err) {
      console.error('Leave application error:', err);
      Alert.alert('Application Failed', err.response?.data?.message || 'Failed to apply for leave.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Leave Balances...</Text>
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
            <Text style={styles.headerTitle}>Leave Management</Text>
            <Text style={styles.headerSubtitle}>Balances & application requests</Text>
          </View>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => {
              if (leaveTypes.length > 0 && !selectedLeaveTypeId) {
                setSelectedLeaveTypeId(leaveTypes[0]._id);
              }
              setModalVisible(true);
            }}
          >
            <Text style={styles.applyButtonText}>+ Apply Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData()} />}
      >
        {/* Balances Ribbon */}
        <Text style={styles.sectionTitle}>Leave Balances</Text>
        <View style={styles.balancesGrid}>
          {balances.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No leave allocations found.</Text>
            </View>
          ) : (
            balances.map((bal) => {
              const allocated = bal.allocated || 0;
              const used = bal.used || 0;
              const remaining = Math.max(0, allocated - used);
              const pct = allocated > 0 ? Math.round((remaining / allocated) * 100) : 0;

              return (
                <View key={bal._id} style={styles.balanceCard}>
                  <Text style={styles.balanceName} numberOfLines={1}>
                    {bal.leaveTypeId?.name || 'Leave'}
                  </Text>
                  <Text style={styles.balanceValue}>{remaining}</Text>
                  <Text style={styles.balanceSub}>of {allocated} remaining</Text>

                  <View style={styles.balanceBarTrack}>
                    <View style={[styles.balanceBarFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Requests List */}
        <View style={styles.requestsSection}>
          <Text style={styles.sectionTitle}>My Requests ({requests.length})</Text>

          {requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏖</Text>
              <Text style={styles.emptyText}>No leave requests submitted yet.</Text>
            </View>
          ) : (
            requests.map((req) => {
              const cfg = STATUS_CONFIG[req.status] || {
                label: req.status,
                color: '#64748b',
                bg: '#f1f5f9',
              };

              return (
                <View key={req._id} style={styles.requestCard}>
                  <View style={styles.requestCardHeader}>
                    <Text style={styles.requestType}>
                      {req.leaveTypeId?.name || 'Leave'}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.requestDates}>
                    {req.startDate} → {req.endDate} ({req.totalDays || 1} day{req.totalDays > 1 ? 's' : ''})
                  </Text>
                  <Text style={styles.requestReason} numberOfLines={2}>
                    {req.reason}
                  </Text>
                </View>
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

      {/* Apply Leave Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply for Leave</Text>
            <Text style={styles.modalSubtitle}>
              Submit a formal request to your reporting manager.
            </Text>

            {/* Leave Type Selector Chips */}
            <Text style={styles.formLabel}>Select Leave Type *</Text>
            <View style={styles.chipsRow}>
              {leaveTypes.map((type) => {
                const isSelected = selectedLeaveTypeId === type._id;
                return (
                  <TouchableOpacity
                    key={type._id}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setSelectedLeaveTypeId(type._id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {type.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Dates */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.formLabel}>Start Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>End Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>

            {/* Reason */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Reason *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Explain the purpose of your leave request..."
                multiline
                numberOfLines={3}
              />
            </View>

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
                onPress={handleApply}
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
  applyButton: {
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
  applyButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  balancesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  balanceCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  balanceName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  balanceValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    marginVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  balanceSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 8,
  },
  balanceBarTrack: {
    width: '100%',
    height: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  balanceBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  requestsSection: {
    marginBottom: 16,
  },
  requestCard: {
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
  requestCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '800',
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
  requestDates: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 4,
  },
  requestReason: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#ffffff',
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
    height: 75,
    textAlignVertical: 'top',
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
});

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
  Modal, Platform, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ShieldAlert, Clock, AlertTriangle, Calendar,
  CheckCircle2, XCircle, Search, RefreshCw, X, Check, ChevronLeft, ChevronRight
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { managerApi } from '../../../services/api/managerApi';

const colors = {
  primary: '#7c3aed', // Violet-600 to match web theme
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  border: '#e2e8f0',
  background: '#f8fafc',
  card: '#ffffff'
};

export default function SessionReactivationsScreen({ navigation }) {
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    kpis: { totalAutoCheckedOut: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 },
    records: [],
  });

  // Action Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' | 'reject'
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRecords = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await managerApi.getSessionReactivations(dateStr, search);
      if (res.data?.success && res.data?.data) {
        setData(res.data.data);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch session reactivations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateStr, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    if (!data.records) return [];
    if (activeFilter === 'all') return data.records;
    if (activeFilter === 'pending') {
      return data.records.filter((r) => r.reactivationStatus === 'pending');
    }
    if (activeFilter === 'approved') {
      return data.records.filter((r) => r.reactivationStatus === 'approved');
    }
    if (activeFilter === 'rejected') {
      return data.records.filter((r) => r.reactivationStatus === 'rejected');
    }
    return data.records;
  }, [data.records, activeFilter]);

  const groupedRecords = useMemo(() => {
    const groups = {};
    filteredRecords.forEach(record => {
      const teamName = record.userId?.teamId?.name || 'Unassigned';
      if (!groups[teamName]) {
        groups[teamName] = [];
      }
      groups[teamName].push(record);
    });
    
    return Object.entries(groups)
      .map(([teamName, items]) => ({
        teamName,
        items
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [filteredRecords]);

  const isPast6PmToday = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (dateStr < todayStr) return true;
    if (dateStr > todayStr) return false;
    const now = new Date();
    const shiftEnd = new Date(`${todayStr}T18:00:00.000+05:30`);
    return now.getTime() >= shiftEnd.getTime();
  }, [dateStr]);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
      setLoading(true);
    }
  };

  const changeDateByDays = (days) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    setDate(newDate);
    setLoading(true);
  };

  const handleOpenActionModal = (record, action) => {
    setSelectedRecord(record);
    setActionType(action);
    setDecisionNotes('');
    setModalVisible(true);
  };

  const handleConfirmDecision = async () => {
    if (!selectedRecord || !actionType) return;
    setSubmitting(true);
    
    try {
      await managerApi.decideSessionReactivation(selectedRecord._id, {
        action: actionType,
        decision: actionType,
        notes: decisionNotes.trim() || undefined,
      });

      setModalVisible(false);
      
      // Auto-switch tab based on decision
      if (actionType === 'approve') setActiveFilter('approved');
      if (actionType === 'reject') setActiveFilter('rejected');

      Alert.alert('Success', `Session ${actionType === 'approve' ? 'reactivated' : 'closed'} successfully.`);
      fetchRecords();
    } catch (err) {
      if (err.response?.data?.code === 'ALREADY_ACTIVE' || err.response?.data?.message?.includes('already active')) {
        Alert.alert('Info', `Session is already active.`);
        setModalVisible(false);
        setActiveFilter('approved');
        fetchRecords();
      } else {
        Alert.alert('Error', err.response?.data?.message || 'Action failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
    } catch {
      return '--:--';
    }
  };

  const renderFilterTab = (id, label, count) => {
    const isActive = activeFilter === id;
    return (
      <TouchableOpacity
        key={id}
        style={[styles.filterTab, isActive && styles.filterTabActive]}
        onPress={() => setActiveFilter(id)}
      >
        <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>{label}</Text>
        <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
          <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={{ marginRight: 12 }}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.iconCircle}>
            <ShieldAlert size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Session Reactivations</Text>
            <Text style={styles.headerSubtitle}>Review auto-checked out accounts</Text>
          </View>
        </View>
      </View>
      </SafeAreaView>

      {/* Date Navigation */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => changeDateByDays(-1)} style={styles.dateBtn}>
          <ChevronLeft size={20} color="#475569" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateCenter}>
          <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={styles.dateText}>
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => changeDateByDays(1)} 
          style={styles.dateBtn}
          disabled={date.toISOString().split('T')[0] >= new Date().toISOString().split('T')[0]}
        >
          <ChevronRight 
            size={20} 
            color={date.toISOString().split('T')[0] >= new Date().toISOString().split('T')[0] ? '#cbd5e1' : '#475569'} 
          />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      )}

      {/* Controls: Search, Refresh */}
      <View style={styles.controlsContainer}>
        <View style={styles.searchBox}>
          <Search size={16} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search employee..."
            onSubmitEditing={() => fetchRecords()}
          />
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={() => fetchRecords(true)}>
          <RefreshCw size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* 6 PM Warning */}
      {isPast6PmToday && (
        <View style={styles.warningBanner}>
          <AlertTriangle size={20} color="#b45309" />
          <Text style={styles.warningText}>Shift Closed (6:00 PM IST): Reactivations are disabled.</Text>
        </View>
      )}

      {/* Filters Scroll */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {renderFilterTab('all', 'All', data.records?.length || 0)}
          {renderFilterTab('pending', 'Pending Review', data.kpis?.pendingCount || 0)}
          {renderFilterTab('approved', 'Approved', data.kpis?.approvedCount || 0)}
          {renderFilterTab('rejected', 'Rejected', data.kpis?.rejectedCount || 0)}
        </ScrollView>
      </View>

      {/* Records List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchRecords(true)} colors={[colors.primary]} />}
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.centerText}>Loading records...</Text>
          </View>
        ) : filteredRecords.length === 0 ? (
          <View style={styles.centerBox}>
            <CheckCircle2 size={40} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Records Found</Text>
            <Text style={styles.emptySubtitle}>All caught up!</Text>
          </View>
        ) : (
          groupedRecords.map(group => (
            <View key={group.teamName} style={styles.teamGroup}>
              <View style={styles.teamGroupHeader}>
                <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                <Text style={styles.teamGroupSubtitle}>· {group.items.length} record{group.items.length !== 1 ? 's' : ''}</Text>
              </View>
              {group.items.map((record) => {
                const employee = record.userId;
                const isPending = record.reactivationStatus === 'pending';
                const isApproved = record.reactivationStatus === 'approved';
                const isRejected = record.reactivationStatus === 'rejected';

                return (
                  <View key={record._id} style={styles.recordCard}>
                    <View style={styles.employeeHeader}>
                      {employee?.avatarUrl ? (
                        <Image source={{ uri: employee.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarText}>{employee?.name?.[0]?.toUpperCase() || 'U'}</Text>
                        </View>
                      )}
                      <View style={styles.employeeInfo}>
                        <Text style={styles.employeeName}>{employee?.name || 'Unknown'}</Text>
                        <Text style={styles.employeeEmail}>{employee?.email}</Text>
                      </View>
                    </View>

                    <View style={styles.timeRow}>
                      <Text style={styles.timeLabel}>In: {formatTime(record.checkInTime)}</Text>
                      <Text style={styles.timeLabel}>Auto-Out: {formatTime(record.autoCheckoutAt || record.checkOutTime)}</Text>
                    </View>

                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonTag}>
                        {record.autoCheckoutReason === 'PRESENCE_VALIDATION_FAILED' ? 'Presence Validation Failed' : record.autoCheckoutReason}
                      </Text>
                      {record.outOfBoundsReason ? (
                        <Text style={styles.employeeNote}>"{record.outOfBoundsReason}"</Text>
                      ) : (
                        <Text style={styles.noNoteText}>No explanation submitted</Text>
                      )}
                    </View>

                    {/* Actions */}
                    <View style={styles.actionRow}>
                      {isPending || (!isApproved && !isRejected) ? (
                        <>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.approveBtn, isPast6PmToday && styles.disabledBtn]}
                            disabled={isPast6PmToday}
                            onPress={() => handleOpenActionModal(record, 'approve')}
                          >
                            <Check size={16} color={isPast6PmToday ? "#94a3b8" : "#fff"} />
                            <Text style={[styles.actionBtnText, { color: isPast6PmToday ? "#94a3b8" : "#fff" }]}>
                              Reactivate
                            </Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => handleOpenActionModal(record, 'reject')}
                          >
                            <X size={16} color="#ef4444" />
                            <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Close</Text>
                          </TouchableOpacity>
                        </>
                      ) : isApproved && record.isCurrentlyActive ? (
                        <View style={styles.statusBadgeApproved}>
                          <CheckCircle2 size={14} color="#059669" />
                          <Text style={styles.statusBadgeTextApproved}>Approved & Resumed</Text>
                        </View>
                      ) : isRejected ? (
                        <View style={styles.statusBadgeRejected}>
                          <XCircle size={14} color="#e11d48" />
                          <Text style={styles.statusBadgeTextRejected}>Rejected / Closed</Text>
                        </View>
                      ) : (
                        <View style={styles.statusBadgeWarning}>
                          <AlertTriangle size={14} color="#b45309" />
                          <Text style={styles.statusBadgeTextWarning}>Needs Action</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Decision Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {actionType === 'approve' ? 'Reactivate Session' : 'Close Session'}
            </Text>
            <Text style={styles.modalDesc}>
              {actionType === 'approve' 
                ? `Allow ${selectedRecord?.userId?.name || 'this employee'} to resume their work session?`
                : `Permanently close this session for today?`}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Add an optional note..."
              value={decisionNotes}
              onChangeText={setDecisionNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, actionType === 'approve' ? styles.approveBg : styles.rejectBg]}
                onPress={handleConfirmDecision}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Confirm</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 12, color: colors.secondary },
  
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateBtn: { padding: 8, backgroundColor: colors.background, borderRadius: 8 },
  dateCenter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.primary + '10', borderRadius: 20 },
  dateText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  controlsContainer: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: colors.background },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, height: 36, marginLeft: 8, fontSize: 13, color: '#334155' },
  refreshButton: { width: 36, height: 36, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  
  warningBanner: { marginHorizontal: 12, marginBottom: 8, backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fde68a' },
  warningText: { fontSize: 12, color: '#b45309', fontWeight: '600', marginLeft: 8 },

  filtersScroll: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  filterTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  filterTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterTabText: { fontSize: 13, fontWeight: '600', color: colors.secondary },
  filterTabTextActive: { color: '#ffffff' },
  filterCountBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 },
  filterCountBadgeActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterCountText: { fontSize: 11, fontWeight: '700', color: colors.secondary },
  filterCountTextActive: { color: '#ffffff' },

  listContent: { padding: 12, gap: 12, paddingBottom: 40 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  centerText: { marginTop: 12, color: colors.secondary, fontSize: 14 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySubtitle: { marginTop: 4, fontSize: 13, color: colors.secondary },

  recordCard: { backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12 },
  avatarFallback: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  employeeInfo: { marginLeft: 12, flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  employeeEmail: { fontSize: 12, color: colors.secondary },
  
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeLabel: { fontSize: 12, color: '#475569', fontWeight: '500' },
  
  reasonBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16 },
  reasonTag: { fontSize: 10, fontWeight: '700', color: '#be123c', textTransform: 'uppercase', marginBottom: 4 },
  employeeNote: { fontSize: 13, color: '#334155', fontStyle: 'italic' },
  noNoteText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flex: 1, justifyContent: 'center' },
  approveBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  disabledBtn: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  
  statusBadgeApproved: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#a7f3d0' },
  statusBadgeTextApproved: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#059669' },
  statusBadgeRejected: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff1f2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#fecdd3' },
  statusBadgeTextRejected: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#e11d48' },
  statusBadgeWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#fde68a' },
  statusBadgeTextWarning: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#b45309' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#475569', marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, height: 80, textAlignVertical: 'top', fontSize: 14, marginBottom: 20, color: '#334155' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtnCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  modalBtnConfirm: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  approveBg: { backgroundColor: colors.success },
  rejectBg: { backgroundColor: colors.danger },
  modalBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  teamGroup: {
    marginBottom: 16,
  },
  teamGroupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
    marginTop: 8,
  },
  teamGroupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  teamGroupSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 8,
  }
});

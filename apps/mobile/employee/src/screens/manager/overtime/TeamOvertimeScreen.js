import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
  Modal, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock, CheckCircle2, XCircle, FileText,
  Users, Calendar, ChevronLeft, Check, X,
  Timer, AlertTriangle
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';

const colors = {
  primary: '#0ea5e9',
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  violet: '#7c3aed',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

export default function TeamOvertimeScreen({ navigation }) {
  const [data, setData] = useState({ records: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('stage1');

  // Stage 1 Action Modal
  const [stage1ModalVisible, setStage1ModalVisible] = useState(false);
  const [stage1Record, setStage1Record] = useState(null);
  const [stage1Action, setStage1Action] = useState(null);
  const [stage1Note, setStage1Note] = useState('');
  const [submitting1, setSubmitting1] = useState(false);

  // Stage 2 Action Modal
  const [stage2ModalVisible, setStage2ModalVisible] = useState(false);
  const [stage2Record, setStage2Record] = useState(null);
  const [stage2Action, setStage2Action] = useState(null);
  const [stage2Note, setStage2Note] = useState('');
  const [stage2Mins, setStage2Mins] = useState('');
  const [submitting2, setSubmitting2] = useState(false);

  const fetchTeamOvertime = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await managerApi.getTeamOvertime();
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to load team overtime.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamOvertime();
  }, [fetchTeamOvertime]);

  const records = data.records || [];
  const stats = data.stats || {};
  const teamMembers = stats.teamMembers || [];

  const stage1Queue = useMemo(() => records.filter((r) => r.status === 'permission_pending'), [records]);
  const stage2Queue = useMemo(() => records.filter((r) => r.status === 'work_verification_pending'), [records]);
  const historyQueue = useMemo(() => records.filter((r) =>
    ['completed_approved', 'completed_rejected', 'permission_rejected', 'cancelled'].includes(r.status)
  ), [records]);

  const groupQueue = (queue) => {
    const groups = {};
    queue.forEach(item => {
      const teamName = item.userId?.teamId?.name || 'Unassigned';
      if (!groups[teamName]) {
        groups[teamName] = [];
      }
      groups[teamName].push(item);
    });
    
    return Object.entries(groups)
      .map(([teamName, items]) => ({
        teamName,
        items
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  };

  const groupedStage1 = useMemo(() => groupQueue(stage1Queue), [stage1Queue]);
  const groupedStage2 = useMemo(() => groupQueue(stage2Queue), [stage2Queue]);
  const groupedHistory = useMemo(() => groupQueue(historyQueue), [historyQueue]);

  const handleStage1Decision = async () => {
    if (!stage1Record || !stage1Action) return;
    setSubmitting1(true);
    try {
      await managerApi.decideOvertimePermission(stage1Record._id, {
        action: stage1Action,
        note: stage1Note.trim() || undefined,
      });
      setStage1ModalVisible(false);
      Alert.alert('Success', `Overtime permission ${stage1Action === 'approve' ? 'approved' : 'denied'}.`);
      fetchTeamOvertime();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to process request.');
    } finally {
      setSubmitting1(false);
    }
  };

  const handleStage2Decision = async () => {
    if (!stage2Record || !stage2Action) return;
    
    let approvedMinutes = 0;
    if (stage2Action === 'approve') {
      approvedMinutes = parseInt(stage2Mins, 10);
      if (isNaN(approvedMinutes) || approvedMinutes < 0) {
        Alert.alert('Error', 'Please enter a valid number of approved minutes.');
        return;
      }
      if (approvedMinutes > stage2Record.recordedMinutes) {
        Alert.alert('Error', `Approved minutes (${approvedMinutes}) cannot exceed recorded minutes (${stage2Record.recordedMinutes}).`);
        return;
      }
    }

    setSubmitting2(true);
    try {
      await managerApi.decideOvertimeWork(stage2Record._id, {
        action: stage2Action,
        approvedMinutes: stage2Action === 'approve' ? approvedMinutes : 0,
        note: stage2Note.trim() || undefined,
      });
      setStage2ModalVisible(false);
      Alert.alert('Success', `Overtime work ${stage2Action === 'approve' ? 'verified' : 'rejected'}.`);
      fetchTeamOvertime();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to process request.');
    } finally {
      setSubmitting2(false);
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

  const renderTab = (id, title, count, badgeColor) => {
    const isActive = activeTab === id;
    return (
      <TouchableOpacity
        key={id}
        style={[styles.tabBtn, isActive && styles.tabBtnActive, isActive && { borderColor: badgeColor }]}
        onPress={() => setActiveTab(id)}
      >
        <Text style={[styles.tabText, isActive && { color: badgeColor }]}>{title}</Text>
        {count > 0 && (
          <View style={[styles.tabBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.tabBadgeText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={{ marginRight: 16 }}>
          <ChevronLeft size={28} color="#334155" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Team Overtime</Text>
          <Text style={styles.headerSubtitle}>Two-Stage Overtime Approvals</Text>
        </View>
      </View>
      </SafeAreaView>

      {/* Stats Ribbon */}
      <View style={styles.statsRibbon}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrapper, { backgroundColor: 'rgba(217, 119, 6, 0.1)' }]}>
            <Clock size={16} color="#d97706" />
          </View>
          <Text style={styles.statVal}>{stats.pendingPermissionsCount || 0}</Text>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>Stage 1 Pending</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrapper, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
            <FileText size={16} color="#7c3aed" />
          </View>
          <Text style={styles.statVal}>{stats.pendingWorkVerificationsCount || 0}</Text>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>Stage 2 Pending</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrapper, { backgroundColor: 'rgba(5, 150, 105, 0.1)' }]}>
            <CheckCircle2 size={16} color="#059669" />
          </View>
          <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>{stats.teamApprovedFormatted || '0h 00m'}</Text>
          <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>Team Approved OT</Text>
        </View>
      </View>

      {/* Tabs */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {renderTab('stage1', 'Stage 1: Permissions', stage1Queue.length, '#d97706')}
          {renderTab('stage2', 'Stage 2: Work Review', stage2Queue.length, '#7c3aed')}
          {renderTab('members', 'Member Totals', 0, colors.primary)}
          {renderTab('history', 'Audit History', 0, colors.secondary)}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchTeamOvertime(true)} colors={[colors.primary]} />}
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.centerText}>Loading Overtime Records...</Text>
          </View>
        ) : (
          <>
            {/* STAGE 1 */}
            {activeTab === 'stage1' && (
              stage1Queue.length === 0 ? (
                <View style={styles.centerBox}>
                  <CheckCircle2 size={40} color="#10b981" />
                  <Text style={styles.emptyTitle}>All caught up!</Text>
                  <Text style={styles.emptySubtitle}>No pending Stage 1 permissions.</Text>
                </View>
              ) : (
                groupedStage1.map(group => (
                  <View key={group.teamName} style={styles.teamGroup}>
                    <View style={styles.teamGroupHeader}>
                      <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                      <Text style={styles.teamGroupSubtitle}>· {group.items.length} request{group.items.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {group.items.map(r => (
                      <View key={r._id} style={[styles.card, { borderColor: '#fde68a' }]}>
                        <View style={styles.employeeHeader}>
                          {r.userId?.avatarUrl ? (
                            <Image source={{ uri: r.userId.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatarFallback, { backgroundColor: '#fef3c7' }]}>
                              <Text style={{ color: '#d97706', fontWeight: 'bold' }}>{r.userId?.name?.[0]?.toUpperCase() || 'U'}</Text>
                            </View>
                          )}
                          <View style={styles.employeeInfo}>
                            <Text style={styles.employeeName}>{r.userId?.name || 'Unknown'}</Text>
                            <Text style={styles.employeeEmail}>{r.userId?.designation || r.userId?.email}</Text>
                          </View>
                          <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                            <Text style={[styles.badgeText, { color: '#b45309' }]}>Pending</Text>
                          </View>
                        </View>

                        <View style={styles.detailsBox}>
                          <Text style={styles.detailLabel}>Date: <Text style={styles.detailValue}>{r.date}</Text></Text>
                          <Text style={styles.detailLabel}>Requested Window: <Text style={styles.detailValue}>{formatTime(r.requestedStartTime)} - {formatTime(r.requestedEndTime)} ({r.expectedDurationMinutes}m)</Text></Text>
                          <Text style={styles.detailLabel}>Reason:</Text>
                          <Text style={styles.reasonText}>"{r.reason}"</Text>
                        </View>

                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => { setStage1Record(r); setStage1Action('reject'); setStage1Note(''); setStage1ModalVisible(true); }}
                          >
                            <Text style={[styles.actionBtnText, { color: colors.danger }]}>Deny</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.approveBtn]}
                            onPress={() => { setStage1Record(r); setStage1Action('approve'); setStage1Note(''); setStage1ModalVisible(true); }}
                          >
                            <Check size={16} color="#fff" />
                            <Text style={styles.actionBtnTextLight}>Approve Permission</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )
            )}

            {/* STAGE 2 */}
            {activeTab === 'stage2' && (
              stage2Queue.length === 0 ? (
                <View style={styles.centerBox}>
                  <CheckCircle2 size={40} color="#10b981" />
                  <Text style={styles.emptyTitle}>All caught up!</Text>
                  <Text style={styles.emptySubtitle}>No pending Stage 2 work verifications.</Text>
                </View>
              ) : (
                groupedStage2.map(group => (
                  <View key={group.teamName} style={styles.teamGroup}>
                    <View style={styles.teamGroupHeader}>
                      <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                      <Text style={styles.teamGroupSubtitle}>· {group.items.length} request{group.items.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {group.items.map(r => (
                      <View key={r._id} style={[styles.card, { borderColor: '#ddd6fe' }]}>
                        <View style={styles.employeeHeader}>
                          {r.userId?.avatarUrl ? (
                            <Image source={{ uri: r.userId.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatarFallback, { backgroundColor: '#ede9fe' }]}>
                              <Text style={{ color: '#7c3aed', fontWeight: 'bold' }}>{r.userId?.name?.[0]?.toUpperCase() || 'U'}</Text>
                            </View>
                          )}
                          <View style={styles.employeeInfo}>
                            <Text style={styles.employeeName}>{r.userId?.name || 'Unknown'}</Text>
                            <Text style={styles.employeeEmail}>{r.userId?.designation || r.userId?.email}</Text>
                          </View>
                          <View style={[styles.badge, { backgroundColor: '#ede9fe' }]}>
                            <Text style={[styles.badgeText, { color: '#6d28d9' }]}>Stage 2</Text>
                          </View>
                        </View>

                        <View style={styles.detailsBox}>
                          <Text style={styles.detailLabel}>Date: <Text style={styles.detailValue}>{r.date}</Text></Text>
                          <Text style={styles.detailLabel}>Actual Worked Window: <Text style={styles.detailValue}>{formatTime(r.actualStartTime)} - {formatTime(r.actualEndTime)}</Text></Text>
                          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 6 }}>
                            <Text style={styles.detailLabel}>Recorded Duration: <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{Math.floor(r.recordedMinutes / 60)}h {r.recordedMinutes % 60}m</Text> ({r.recordedMinutes} mins)</Text>
                          </View>
                        </View>

                        <View style={[styles.detailsBox, { backgroundColor: '#ecfdf5', borderColor: '#d1fae5', borderWidth: 1, marginTop: 8 }]}>
                          <Text style={[styles.detailLabel, { color: '#065f46' }]}>Submitted Work Details:</Text>
                          <Text style={styles.reasonText}>{r.workDetails || 'No work description submitted.'}</Text>
                        </View>

                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => { setStage2Record(r); setStage2Action('reject'); setStage2Note(''); setStage2ModalVisible(true); }}
                          >
                            <Text style={[styles.actionBtnText, { color: colors.danger }]}>Reject (0 mins)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.approveBtn]}
                            onPress={() => { setStage2Record(r); setStage2Action('approve'); setStage2Note(''); setStage2Mins(r.recordedMinutes.toString()); setStage2ModalVisible(true); }}
                          >
                            <Check size={16} color="#fff" />
                            <Text style={styles.actionBtnTextLight}>Verify & Approve</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )
            )}

            {/* MEMBERS */}
            {activeTab === 'members' && (
              teamMembers.length === 0 ? (
                <View style={styles.centerBox}>
                  <Users size={40} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Members Found</Text>
                </View>
              ) : (
                teamMembers.map(m => (
                  <View key={m.user?._id || m.user} style={styles.card}>
                    <Text style={styles.employeeName}>{m.user?.name || 'Unknown'}</Text>
                    <Text style={styles.employeeEmail}>{m.user?.email}</Text>
                    <View style={styles.statsGrid}>
                      <View style={styles.statCol}>
                        <Text style={styles.statColVal}>{m.completedSessions}</Text>
                        <Text style={styles.statColLabel}>Sessions</Text>
                      </View>
                      <View style={styles.statCol}>
                        <Text style={styles.statColVal}>{m.recordedFormatted}</Text>
                        <Text style={styles.statColLabel}>Recorded</Text>
                      </View>
                      <View style={styles.statCol}>
                        <Text style={[styles.statColVal, { color: colors.success }]}>{m.approvedFormatted}</Text>
                        <Text style={styles.statColLabel}>Approved</Text>
                      </View>
                    </View>
                  </View>
                ))
              )
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
              historyQueue.length === 0 ? (
                <View style={styles.centerBox}>
                  <Clock size={40} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No History</Text>
                </View>
              ) : (
                groupedHistory.map(group => (
                  <View key={group.teamName} style={styles.teamGroup}>
                    <View style={styles.teamGroupHeader}>
                      <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                      <Text style={styles.teamGroupSubtitle}>· {group.items.length} record{group.items.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {group.items.map(r => (
                      <View key={r._id} style={styles.card}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.employeeName}>{r.userId?.name || 'Unknown'}</Text>
                          <Text style={styles.dateText}>{r.date}</Text>
                        </View>
                        
                        {r.status === 'completed_approved' && (
                          <View style={[styles.badge, { backgroundColor: '#d1fae5', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.badgeText, { color: '#065f46' }]}>Approved: +{Math.floor(r.approvedMinutes / 60)}h {r.approvedMinutes % 60}m</Text>
                          </View>
                        )}
                        {r.status === 'completed_rejected' && (
                          <View style={[styles.badge, { backgroundColor: '#ffe4e6', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.badgeText, { color: '#be123c' }]}>Work Rejected (0 mins)</Text>
                          </View>
                        )}
                        {r.status === 'permission_rejected' && (
                          <View style={[styles.badge, { backgroundColor: '#ffe4e6', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.badgeText, { color: '#be123c' }]}>Permission Denied</Text>
                          </View>
                        )}
                        {r.status === 'cancelled' && (
                          <View style={[styles.badge, { backgroundColor: '#f1f5f9', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.badgeText, { color: '#64748b' }]}>Cancelled</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ))
              )
            )}
          </>
        )}
      </ScrollView>

      {/* Stage 1 Modal */}
      <Modal visible={stage1ModalVisible} transparent animationType="fade" onRequestClose={() => setStage1ModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {stage1Action === 'approve' ? 'Approve Permission' : 'Deny Permission'}
            </Text>
            <Text style={styles.modalDesc}>
              {stage1Action === 'approve' 
                ? 'The employee will be allowed to start this overtime session.'
                : 'The employee will not be allowed to start this session.'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Add an optional note..."
              value={stage1Note}
              onChangeText={setStage1Note}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setStage1ModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, stage1Action === 'approve' ? styles.approveBg : styles.rejectBg]}
                onPress={handleStage1Decision}
                disabled={submitting1}
              >
                {submitting1 ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stage 2 Modal */}
      <Modal visible={stage2ModalVisible} transparent animationType="fade" onRequestClose={() => setStage2ModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {stage2Action === 'approve' ? 'Verify & Approve Work' : 'Reject Work'}
            </Text>
            <Text style={styles.modalDesc}>
              {stage2Action === 'approve' 
                ? 'Enter the official minutes to approve and add to their accumulated total.'
                : 'This session will be marked rejected and 0 minutes will be approved.'}
            </Text>

            {stage2Action === 'approve' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Approved Minutes (Max: {stage2Record?.recordedMinutes})</Text>
                <TextInput
                  style={styles.textInputSingle}
                  keyboardType="numeric"
                  value={stage2Mins}
                  onChangeText={setStage2Mins}
                />
              </View>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="Add an optional note..."
              value={stage2Note}
              onChangeText={setStage2Note}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setStage2ModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, stage2Action === 'approve' ? styles.approveBg : styles.rejectBg]}
                onPress={handleStage2Decision}
                disabled={submitting2}
              >
                {submitting2 ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnConfirmText}>Confirm</Text>}
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
  header: { padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  headerTextContainer: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  
  statsRibbon: { 
    flexDirection: 'row', 
    backgroundColor: '#f8fafc', 
    padding: 12,
    paddingHorizontal: 12,
    gap: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border,
  },
  statCard: { 
    flex: 1, 
    aspectRatio: 1,
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff', 
    borderWidth: 1, 
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrapper: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  statVal: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.secondary, marginTop: 2, textTransform: 'uppercase', textAlign: 'center' },

  tabsScroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#f8fafc' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.secondary },
  tabBadge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  centerText: { marginTop: 12, color: colors.secondary, fontSize: 14 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySubtitle: { marginTop: 4, fontSize: 13, color: colors.secondary },

  card: { backgroundColor: colors.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12 },
  avatarFallback: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  employeeInfo: { marginLeft: 12, flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  employeeEmail: { fontSize: 12, color: colors.secondary },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  detailsBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 },
  detailLabel: { fontSize: 12, color: colors.secondary, fontWeight: '500', marginBottom: 4 },
  detailValue: { color: '#0f172a', fontWeight: '700' },
  reasonText: { fontSize: 13, color: '#334155', fontStyle: 'italic', marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  approveBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  actionBtnText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  actionBtnTextLight: { fontSize: 13, fontWeight: '700', color: '#fff', marginLeft: 6 },

  statsGrid: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  statCol: { flex: 1, alignItems: 'center' },
  statColVal: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  statColLabel: { fontSize: 11, color: colors.secondary },
  dateText: { fontSize: 12, color: colors.secondary, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#475569', marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  textInputSingle: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: '#0f172a', fontWeight: 'bold' },
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

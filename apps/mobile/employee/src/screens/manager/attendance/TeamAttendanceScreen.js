import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Platform,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  Users,
  UserCheck,
  UserX,
  Check,
  X,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';

const colors = {
  primary: '#8b5cf6', // Violet matching Web UI
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

export default function TeamAttendanceScreen({ navigation }) {
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');

  const { socket } = useSocket();

  const fetchAttendance = useCallback(async () => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const res = await managerApi.getTeamAttendanceRoster(dateStr);
      setRecords(res.data?.data?.attendance || []);
    } catch (err) {
      console.error('Fetch attendance error:', err);
      Alert.alert('Error', 'Failed to load team attendance records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      if (date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
        fetchAttendance();
      }
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    socket.on('attendance:manual_request_created', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
      socket.off('attendance:manual_request_created', onUpdate);
    };
  }, [socket, fetchAttendance, date]);

  const handleManualDecision = async () => {
    if (!decisionModal) return;
    const { requestId, action } = decisionModal;
    setProcessingId(requestId + action);
    setDecisionModal(null);
    try {
      await managerApi.decideManualAttendance(requestId, {
        action,
        decisionNote: decisionNote.trim() || undefined,
      });
      Alert.alert('Success', `Manual attendance ${action === 'approve' ? 'approved' : 'rejected'}.`);
      fetchAttendance();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || `Failed to ${action} manual attendance.`);
    } finally {
      setProcessingId(null);
      setDecisionNote('');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAttendance();
  };

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

  // KPI counts
  const totalCount = records.length;
  const presentCount = records.filter(r => r.status === 'present' || (r.checkInTime && r.status !== 'manual_pending')).length;
  const absentCount = records.filter(r => ['not_checked_in', 'absent'].includes(r.status) && !r.checkInTime).length;
  const pendingCount = records.filter(r => r.status === 'manual_pending' || r.manualRequest?.status === 'pending').length;

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const name = record.userId?.name || '';
      const email = record.userId?.email || '';
      const matchesSearch = !search.trim() || `${name} ${email}`.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (statusFilter === 'present') return (record.status === 'present' || record.checkInTime) && record.status !== 'manual_pending';
      if (statusFilter === 'absent') return ['not_checked_in', 'absent'].includes(record.status) && !record.checkInTime;
      if (statusFilter === 'pending') return record.status === 'manual_pending' || record.manualRequest?.status === 'pending';
      return true;
    });
  }, [records, search, statusFilter]);

  const groupedRecords = useMemo(() => {
    const groups = {};
    filteredRecords.forEach(record => {
      const teamName = record.userId?.teamId?.name || 'Unassigned';
      if (!groups[teamName]) groups[teamName] = [];
      groups[teamName].push(record);
    });
    return Object.entries(groups)
      .map(([teamName, recs]) => ({ teamName, records: recs }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [filteredRecords]);

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'present':
      case 'attended':
        return { text: 'Present', color: colors.success, icon: CheckCircle2, bg: colors.success + '15' };
      case 'manual_pending':
      case 'pending':
      case 'review':
        return { text: 'Pending Approval', color: colors.warning, icon: Clock, bg: colors.warning + '15' };
      case 'not_checked_in':
      case 'absent':
        return { text: 'Absent / Missing', color: colors.danger, icon: XCircle, bg: colors.danger + '15' };
      case 'on_leave':
        return { text: 'On Leave', color: colors.info, icon: Calendar, bg: colors.info + '15' };
      default:
        return { text: 'Unknown', color: colors.secondary, icon: AlertCircle, bg: colors.secondary + '15' };
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
    } catch {
      return '—';
    }
  };

  const isManualPending = (item) =>
    item.status === 'manual_pending' || item.manualRequest?.status === 'pending';

  const renderRecord = (item) => {
    const display = getStatusDisplay(item.status);
    const StatusIcon = display.icon;
    const manReqId = item.manualRequest?._id || item._id;
    const isPending = isManualPending(item);
    const isProcessing = processingId === manReqId + 'approve' || processingId === manReqId + 'reject';

    let displayTotal = '—';
    let displayBreak = '—';
    let displayWork = '—';
    
    if (item.checkInTime) {
      const checkInDate = new Date(item.checkInTime);
      const checkOutDate = item.checkOutTime ? new Date(item.checkOutTime) : new Date();
      
      const totalTimeMs = checkOutDate - checkInDate;
      const breakMs = 60 * 60 * 1000; // Exact 60 mins break
      
      let workTimeMs = totalTimeMs - breakMs;
      if (workTimeMs < 0) workTimeMs = 0;
      
      const tHours = Math.floor(totalTimeMs / (1000 * 60 * 60));
      const tMins = Math.floor((totalTimeMs % (1000 * 60 * 60)) / (1000 * 60));
      displayTotal = `${tHours}h ${tMins}m`;
      
      displayBreak = `1h 0m`; // Exact 60 min
      
      const wHours = Math.floor(workTimeMs / (1000 * 60 * 60));
      const wMins = Math.floor((workTimeMs % (1000 * 60 * 60)) / (1000 * 60));
      displayWork = `${wHours}h ${wMins}m`;
    }

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.userInfo}>
            {item.userId?.avatarUrl ? (
              <Image source={{ uri: item.userId.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>{item.userId?.name?.charAt(0).toUpperCase() || 'U'}</Text>
              </View>
            )}
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{item.userId?.name || 'Unknown'}</Text>
              <Text style={styles.userEmail}>{item.userId?.email || ''}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: display.bg, borderColor: display.color }]}>
            <StatusIcon size={12} color={display.color} />
            <Text style={[styles.statusText, { color: display.color }]}>{display.text}</Text>
          </View>
        </View>

        <View style={styles.recordStats}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Check In</Text>
            <Text style={styles.statValue}>{formatTime(item.checkInTime)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Check Out</Text>
            <Text style={styles.statValue}>{formatTime(item.checkOutTime)}</Text>
          </View>
        </View>

        <View style={[styles.recordStats, { marginTop: 12, backgroundColor: '#f1f5f9' }]}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Time</Text>
            <Text style={[styles.statValue, { color: colors.secondary }]}>{displayTotal}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Break</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>{displayBreak}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Work Time</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>{displayWork}</Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.manualActionRow}>
            <View style={styles.manualPendingBadge}>
              <Clock size={12} color={colors.warning} />
              <Text style={styles.manualPendingText}>Manual Check-in Request</Text>
            </View>
            <View style={styles.manualActionBtns}>
              {isProcessing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.rejectBtnInline}
                    onPress={() => { setDecisionNote(''); setDecisionModal({ requestId: manReqId, action: 'reject' }); }}
                  >
                    <X size={14} color={colors.danger} />
                    <Text style={styles.rejectBtnInlineText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveBtnInline}
                    onPress={() => { setDecisionNote(''); setDecisionModal({ requestId: manReqId, action: 'approve' }); }}
                  >
                    <Check size={14} color="#fff" />
                    <Text style={styles.approveBtnInlineText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const KpiTile = ({ label, count, color, bgColor, icon: Icon, filterKey }) => {
    const isActive = statusFilter === filterKey;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.kpiTile, 
          isActive && { 
            backgroundColor: color, 
            borderColor: color,
            shadowColor: color,
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 12,
            elevation: 8,
          }
        ]}
        onPress={() => setStatusFilter(filterKey)}
      >
        <View style={[styles.kpiIcon, { backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : bgColor }]}>
          <Icon size={16} color={isActive ? '#fff' : color} />
        </View>
        <Text style={[styles.kpiCount, isActive && { color: '#fff' }]}>{count}</Text>
        <Text style={[styles.kpiLabel, isActive && { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Team Attendance</Text>
            <Text style={styles.headerSubtitle}>Daily logs and history</Text>
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

      {/* KPI Ribbon */}
      <View style={styles.kpiRibbon}>
        <KpiTile label="Total" count={totalCount} color={colors.primary} bgColor="#ede9fe" icon={Users} filterKey="all" />
        <KpiTile label="Present" count={presentCount} color={colors.success} bgColor="#d1fae5" icon={UserCheck} filterKey="present" />
        <KpiTile label="Absent" count={absentCount} color={colors.danger} bgColor="#fee2e2" icon={UserX} filterKey="absent" />
        <KpiTile label="Pending" count={pendingCount} color={colors.warning} bgColor="#fef3c7" icon={Clock} filterKey="pending" />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.secondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XCircle size={16} color={colors.secondary} />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : filteredRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Calendar size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Records Found</Text>
          <Text style={styles.emptyDesc}>No attendance records match your current filters for this date.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {groupedRecords.map(group => (
            <View key={group.teamName} style={styles.teamGroup}>
              <View style={styles.teamGroupHeader}>
                <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                <Text style={styles.teamGroupSubtitle}>· {group.records.length} member{group.records.length !== 1 ? 's' : ''}</Text>
              </View>
              {group.records.map(record => (
                <React.Fragment key={record._id}>
                  {renderRecord(record)}
                </React.Fragment>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Manual Attendance Decision Modal */}
      <Modal visible={!!decisionModal} transparent animationType="slide" onRequestClose={() => setDecisionModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {decisionModal?.action === 'approve' ? '✅ Approve' : '❌ Reject'} Manual Check-in
            </Text>
            <Text style={styles.modalSubtitle}>Add an optional note for this decision.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Decision note (optional)..."
              placeholderTextColor="#94a3b8"
              value={decisionNote}
              onChangeText={setDecisionNote}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDecisionModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: decisionModal?.action === 'approve' ? colors.success : colors.danger }]}
                onPress={handleManualDecision}
              >
                <Text style={styles.modalConfirmText}>
                  {decisionModal?.action === 'approve' ? 'Approve' : 'Reject'}
                </Text>
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateBtn: {
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  dateCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary + '10',
    borderRadius: 20,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  filterContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterList: {
    padding: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 40,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userDetails: {
    justifyContent: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#94a3b8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  recordStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  breaksContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breaksHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  breakTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  breakDurationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
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
  },
  // KPI Ribbon
  kpiRibbon: {
    flexDirection: 'row', 
    backgroundColor: '#f8fafc', 
    padding: 12,
    paddingHorizontal: 12,
    gap: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border,
  },
  kpiTile: {
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
  kpiIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  kpiCount: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: colors.secondary, marginTop: 2, textTransform: 'uppercase' },
  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  // Manual approval
  manualActionRow: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  manualPendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  manualPendingText: { fontSize: 12, fontWeight: '600', color: colors.warning },
  manualActionBtns: { flexDirection: 'row', gap: 10 },
  rejectBtnInline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
  },
  rejectBtnInlineText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  approveBtnInline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.success,
  },
  approveBtnInlineText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Decision Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: colors.secondary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 12, fontSize: 14, color: '#0f172a',
    backgroundColor: colors.background, minHeight: 80, textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.background, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: colors.secondary },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

import React, { useState, useEffect, useCallback } from 'react';
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
  Linking,
  Modal,
  ScrollView
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Download,
  AlertTriangle,
  X
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';
import DocumentViewerModal from '../../../components/DocumentViewerModal';

const PremiumCalendarModal = ({ visible, selectedDate, onSelect, onClose }) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());
  useEffect(() => { if (visible) setCurrentMonth(selectedDate || new Date()); }, [visible, selectedDate]);
  if (!visible) return null;
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const days = [];
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 28, width: '90%', padding: 24, shadowColor: '#6d28d9', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={{ padding: 8, backgroundColor: '#f8fafc', borderRadius: 12 }}>
              <ChevronLeft color="#4c1d95" size={20} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#4c1d95', letterSpacing: 0.5 }}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={{ padding: 8, backgroundColor: '#f8fafc', borderRadius: 12 }}>
              <ChevronRight color="#4c1d95" size={20} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            {weekDays.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#94a3b8' }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {days.map((d, i) => {
              if (!d) return <View key={i} style={{ width: '14.28%', aspectRatio: 1 }} />;
              const isSelected = d.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0];
              const isToday = d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
              const isFuture = d > new Date();
              return (
                <TouchableOpacity 
                  key={i} disabled={isFuture} onPress={() => { onSelect(d); onClose(); }}
                  style={{ width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: isSelected ? '#6d28d9' : isToday ? '#f5f3ff' : 'transparent' }}>
                    <Text style={{ fontSize: 15, fontWeight: isSelected || isToday ? '800' : '600', color: isSelected ? '#fff' : isFuture ? '#cbd5e1' : isToday ? '#6d28d9' : '#334155' }}>
                      {d.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

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

export default function TeamDailyLogsScreen({ navigation }) {
  const [data, setData] = useState({ logs: [], missingMembers: [] });
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedLog, setSelectedLog] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerName, setViewerName] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);

  const { socket } = useSocket();

  const fetchLogs = useCallback(async () => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const res = await managerApi.getTeamDailyLogs(dateStr);
      setData(res.data?.data || { logs: [], missingMembers: [] });
    } catch (err) {
      console.error('Fetch logs error:', err);
      Alert.alert('Error', 'Failed to load team daily logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      if (date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
        fetchLogs();
      }
    };
    socket.on('attendance:update', onUpdate);
    return () => socket.off('attendance:update', onUpdate);
  }, [socket, fetchLogs, date]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const handleDateSelect = (selectedDate) => {
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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    if (timeStr.includes('T')) {
      return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return timeStr;
  };

  const handleViewAttachment = async (log) => {
    if (openingDocId) return;
    setOpeningDocId(log._id);
    try {
      let url = log.documentUrl || log.attachmentUrl;
      
      // Phase 5: Fetch document on-demand if payload was excluded from bulk response
      if (!url && log.hasDocument && log._id) {
        try {
          const res = await managerApi.getDailyLogDocument(log._id);
          if (res.data?.success && res.data?.data) {
            url = res.data.data.documentUrl || res.data.data.attachmentUrl;
          } else {
            Alert.alert('Error', 'Could not load the document payload from the server.');
            return;
          }
        } catch (apiError) {
          console.error('Failed to load document payload', apiError);
          Alert.alert('Error', 'Failed to fetch the document. ' + (apiError.response?.data?.message || ''));
          return;
        }
      }

      if (!url) return;

      setViewerUrl(url);
      setViewerName(log.documentName || 'Daily Log Document');
    } catch (err) {
      console.error('Document error:', err);
      Alert.alert('Error', 'An error occurred while opening the document.');
    } finally {
      setOpeningDocId(null);
    }
  };

  // Combine logs and missing members into one list for FlatList rendering
  const combinedList = [];
  if (statusFilter === 'all' || statusFilter === 'submitted') {
    combinedList.push(...data.logs.map(log => ({ ...log, isMissing: false })));
  }
  if (statusFilter === 'all' || statusFilter === 'missing') {
    combinedList.push(...data.missingMembers.map(member => ({ ...member, isMissing: true })));
  }

  const groupedLogs = React.useMemo(() => {
    const groups = {};
    combinedList.forEach(item => {
      let teamName = 'Unassigned';
      if (item.isMissing) {
        teamName = item.teamId?.name || 'Unassigned';
      } else {
        teamName = item.userId?.teamId?.name || 'Unassigned';
      }
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
  }, [combinedList]);

  const renderItem = (item) => {
    if (item.isMissing) {
      // Missing Member UI
      return (
        <View style={[styles.recordCard, { borderColor: '#fecaca', backgroundColor: '#fef2f2', shadowColor: '#ef4444' }]}>
          <View style={styles.recordHeader}>
            <View style={styles.userInfo}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.danger + '20' }]}>
                  <Text style={[styles.avatarText, { color: colors.danger }]}>{item.name?.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>Missing Daily Work Log</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: '#fee2e2' }]}>
              <XCircle size={12} color={colors.danger} />
              <Text style={[styles.statusText, { color: colors.danger }]}>Not Submitted</Text>
            </View>
          </View>
        </View>
      );
    }

    // Submitted Log UI
    return (
      <View style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.userInfo}>
            {item.userId?.avatarUrl ? (
              <Image source={{ uri: item.userId.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>{item.userId?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{item.userId?.name}</Text>
              <Text style={styles.userEmail}>{item.userId?.email}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: '#dcfce7' }]}>
            <CheckCircle2 size={12} color={colors.success} />
            <Text style={[styles.statusText, { color: colors.success }]}>Submitted</Text>
          </View>
        </View>

        <View style={styles.recordStats}>
          <Text style={styles.logSummary} numberOfLines={2}>
            {item.taskTitle || item.description || item.campaignName || item.outputSummary || 'Task logged'}
          </Text>
          <TouchableOpacity 
            style={styles.viewBtn}
            onPress={() => setSelectedLog(item)}
          >
            <Text style={styles.viewBtnText}>View Report</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={28} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Team Daily Logs</Text>
          <Text style={styles.headerSubtitle}>End-of-day work reports</Text>
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

      <PremiumCalendarModal
        visible={showDatePicker}
        selectedDate={date}
        onSelect={handleDateSelect}
        onClose={() => setShowDatePicker(false)}
      />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { id: 'all', label: `All (${data.logs.length + data.missingMembers.length})` },
            { id: 'submitted', label: `Submitted (${data.logs.length})` },
            { id: 'missing', label: `Missing (${data.missingMembers.length})` },
          ]}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterTab, statusFilter === item.id && styles.filterTabActive]}
              onPress={() => setStatusFilter(item.id)}
            >
              <Text style={[styles.filterText, statusFilter === item.id && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filterList}
        />
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : combinedList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FileText size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Logs Found</Text>
          <Text style={styles.emptyDesc}>There are no daily logs matching your current filters.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {groupedLogs.map(group => (
            <View key={group.teamName} style={styles.teamGroup}>
              <View style={styles.teamGroupHeader}>
                <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                <Text style={styles.teamGroupSubtitle}>· {group.items.length} log{group.items.length !== 1 ? 's' : ''}</Text>
              </View>
              {group.items.map((item, index) => (
                 <React.Fragment key={item._id || `missing-${item.email || index}`}>
                   {renderItem(item)}
                 </React.Fragment>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Log Details Modal */}
      <Modal
        visible={!!selectedLog}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedLog(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Daily Work Report</Text>
              <TouchableOpacity onPress={() => setSelectedLog(null)}>
                <X size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView contentContainerStyle={styles.modalBody}>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                    {selectedLog.userId?.name}'s Log
                  </Text>
                  <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    Submitted at: {selectedLog.submittedAt ? new Date(selectedLog.submittedAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
                  </Text>
                </View>

                <View style={styles.taskCard}>
                  <View style={[styles.taskMeta, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                    <Text style={styles.taskHours}>Hours: {selectedLog.hoursSpent}</Text>
                    {selectedLog.checkInTime && <Text style={styles.taskStatus}>In: {formatTime(selectedLog.checkInTime)}</Text>}
                    {selectedLog.checkOutTime && <Text style={styles.taskStatus}>Out: {formatTime(selectedLog.checkOutTime)}</Text>}
                  </View>
                  
                  {selectedLog.taskTitle ? <Text style={styles.taskTitle}>{selectedLog.taskTitle}</Text> : null}
                    {selectedLog.documentName && selectedLog.documentName !== selectedLog.taskTitle ? <Text style={styles.taskTitle}>{selectedLog.documentName}</Text> : null}
                    {selectedLog.campaignName && selectedLog.campaignName !== selectedLog.taskTitle ? <Text style={styles.taskTitle}>{selectedLog.campaignName}</Text> : null}
                  
                  {selectedLog.projectName ? <Text style={styles.taskDesc}><Text style={{fontWeight: '700'}}>Project:</Text> {selectedLog.projectName}</Text> : null}
                  {selectedLog.ticketId ? <Text style={styles.taskDesc}><Text style={{fontWeight: '700'}}>Ticket:</Text> {selectedLog.ticketId}</Text> : null}
                  {selectedLog.platform ? <Text style={styles.taskDesc}><Text style={{fontWeight: '700'}}>Platform:</Text> {selectedLog.platform}</Text> : null}
                  
                  {selectedLog.description ? (
                    <Text style={[styles.taskDesc, { marginTop: 8 }]}><Text style={{fontWeight: '700'}}>Description:</Text> {selectedLog.description}</Text>
                  ) : null}
                  {selectedLog.outputSummary ? (
                    <Text style={[styles.taskDesc, { marginTop: 8 }]}><Text style={{fontWeight: '700'}}>Summary:</Text> {selectedLog.outputSummary}</Text>
                  ) : null}
                  {selectedLog.blockers ? (
                    <Text style={[styles.taskDesc, { marginTop: 8, color: '#ef4444' }]}><Text style={{fontWeight: '700'}}>Blockers:</Text> {selectedLog.blockers}</Text>
                  ) : null}
                  {selectedLog.githubLink ? (
                    <TouchableOpacity onPress={() => Linking.openURL(selectedLog.githubLink)}>
                      <Text style={[styles.taskDesc, { marginTop: 8, color: colors.primary, textDecorationLine: 'underline' }]}>
                        {selectedLog.githubLink}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {(selectedLog.documentUrl || selectedLog.attachmentUrl || selectedLog.hasDocument) && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: '#eff6ff', padding: 12, borderRadius: 12, marginTop: 16,
                      borderWidth: 1, borderColor: '#bfdbfe'
                    }}
                    onPress={() => handleViewAttachment(selectedLog)}
                  >
                    <FileText size={18} color="#2563eb" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 14 }}>
                      View Attached Report
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <DocumentViewerModal 
        visible={!!viewerUrl} 
        onClose={() => setViewerUrl(null)}
        documentUrl={viewerUrl}
        documentName={viewerName}
      />
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
    paddingTop: 20,
    backgroundColor: '#fff',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 10,
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
    backgroundColor: '#f8fafc',
    padding: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#f1f5f9',
  },
  dateBtn: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dateCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#ede9fe',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6d28d9',
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ede9fe',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  filterTabActive: {
    backgroundColor: '#6d28d9',
    borderColor: '#6d28d9',
    shadowOpacity: 0.2,
    elevation: 6,
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#ede9fe',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 14,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recordStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
  },
  logSummary: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
    marginRight: 12,
  },
  viewBtn: {
    backgroundColor: '#6d28d9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#ede9fe',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4c1d95',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  taskDesc: {
    fontSize: 15,
    color: '#334155',
    marginBottom: 12,
    lineHeight: 24,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#f5f3ff',
    paddingBottom: 16,
    marginBottom: 18,
  },
  taskStatus: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6d28d9',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  taskHours: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
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
    fontSize: 19,
    fontWeight: '800',
    color: '#4c1d95',
    letterSpacing: 0.3,
  },
  teamGroupSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginLeft: 8,
  }
});

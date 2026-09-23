import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Smartphone, MapPin, CheckCircle2, XCircle, Clock,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
  RefreshCw, User, Globe, Shield, Search, Calendar,
  Check, ArrowRight, Sparkles, ChevronLeft
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';

const colors = {
  primary: '#8b5cf6',
  primaryLight: '#ede9fe',
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  textDark: '#0f172a',
};

// Components for empty states and loading
const LoadingState = () => (
  <View style={styles.centerContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.loadingText}>Loading requests...</Text>
  </View>
);

const ErrorState = ({ error, onRetry }) => (
  <View style={styles.centerContainer}>
    <AlertTriangle size={48} color={colors.danger} />
    <Text style={styles.errorText}>{error}</Text>
    <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
      <Text style={styles.retryText}>Try Again</Text>
    </TouchableOpacity>
  </View>
);

const EmptyState = ({ search, filter }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconBg}>
      <Smartphone size={32} color={colors.primary} />
    </View>
    <Text style={styles.emptyTitle}>No Device Requests Found</Text>
    <Text style={styles.emptySubtitle}>
      {search ? 'Try adjusting your search terms.' : `There are no ${filter} device requests from your team.`}
    </Text>
  </View>
);

const DecisionModal = ({ visible, onClose, title, actionType, note, setNote, onConfirm }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalSubtitle}>Provide a reason for this decision (optional but recommended).</Text>
        
        <TextInput
          style={styles.modalInput}
          placeholder={`Add a note for the ${actionType}...`}
          placeholderTextColor="#94a3b8"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modalConfirmBtn, { backgroundColor: actionType === 'approve' ? colors.success : colors.danger }]} 
            onPress={onConfirm}
          >
            <Text style={styles.modalConfirmText}>{actionType === 'approve' ? 'Approve' : 'Reject'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

export default function ManagerDeviceRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  const [expandedReq, setExpandedReq] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionType, setActionType] = useState('approve'); // 'approve' | 'reject'
  
  const { socket } = useSocket();

  const fetchRequests = useCallback(async (isPull = false) => {
    if (!isPull) setLoading(true);
    try {
      setError(null);
      const res = await managerApi.getDeviceRequests(statusFilter);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      setError(err.response?.status === 403 ? 'Permission denied.' : 'Failed to load requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchRequests();
    socket.on('device:request_created', onUpdate);
    socket.on('device:request_resolved', onUpdate);
    return () => {
      socket.off('device:request_created', onUpdate);
      socket.off('device:request_resolved', onUpdate);
    };
  }, [socket, fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests(true);
  };

  const openDecisionModal = (req, type) => {
    setSelectedRequest(req);
    setActionType(type);
    setDecisionNote('');
    setModalVisible(true);
  };

  const handleDecision = async () => {
    if (!selectedRequest) return;
    try {
      setModalVisible(false);
      setLoading(true);
      await managerApi.decideDeviceRequest(selectedRequest._id, { action: actionType, decisionNote });
      Alert.alert('Success', `Device request ${actionType}d successfully.`);
      fetchRequests();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || `Failed to ${actionType} request.`);
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedReq(expandedReq === id ? null : id);
  };

  // Filtering
  const filteredRequests = useMemo(() => {
    if (!search.trim()) return requests;
    const term = search.toLowerCase();
    return requests.filter(req => {
      const userName = req.userId?.name?.toLowerCase() || '';
      const device = req.requestedDeviceLabel?.toLowerCase() || '';
      const ip = req.ipAddress?.toLowerCase() || '';
      const reason = req.reason?.toLowerCase() || '';
      return userName.includes(term) || device.includes(term) || ip.includes(term) || reason.includes(term);
    });
  }, [requests, search]);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return { bg: '#fef3c7', text: '#b45309', label: 'Pending' };
      case 'approved': return { bg: '#ecfdf5', text: '#047857', label: 'Approved' };
      case 'rejected': return { bg: '#fef2f2', text: '#b91c1c', label: 'Rejected' };
      default: return { bg: '#f1f5f9', text: '#475569', label: status };
    }
  };

  const getTypeBadge = (type) => {
    switch(type) {
      case 'register': return { bg: '#f0f9ff', text: '#0369a1' };
      case 'replacement': return { bg: '#f5f3ff', text: '#6d28d9' };
      case 'temporary': return { bg: '#fffbeb', text: '#b45309' };
      case 'lost': return { bg: '#fff1f2', text: '#be123c' };
      default: return { bg: '#f1f5f9', text: '#475569' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Smartphone size={24} color={colors.primary} />
            <Text style={styles.headerTitle}>Device Approvals</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Filters & Search */}
      <View style={styles.filtersContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search employee, device, IP..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {['all', 'pending', 'approved', 'rejected'].map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.filterTab, statusFilter === tab && styles.filterTabActive]}
                onPress={() => setStatusFilter(tab)}
              >
                <Text style={[styles.filterTabText, statusFilter === tab && styles.filterTabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} {counts[tab] !== undefined ? `(${counts[tab]})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* List */}
      <View style={styles.contentArea}>
        {loading && !refreshing ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={() => fetchRequests(true)} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            {filteredRequests.length === 0 ? (
              <EmptyState search={search} filter={statusFilter} />
            ) : (
              filteredRequests.map(req => {
                const statusBadge = getStatusBadge(req.status);
                const typeBadge = getTypeBadge(req.requestType);
                const isExpanded = expandedReq === req._id;

                return (
                  <View key={req._id} style={styles.card}>
                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{req.userId?.name?.charAt(0) || 'U'}</Text>
                        </View>
                        <View>
                          <Text style={styles.employeeName}>{req.userId?.name || 'Unknown'}</Text>
                          <View style={styles.badgeRow}>
                            <View style={[styles.badge, { backgroundColor: typeBadge.bg }]}>
                              <Text style={[styles.badgeText, { color: typeBadge.text }]}>{req.requestType}</Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
                              <Text style={[styles.badgeText, { color: statusBadge.text }]}>{statusBadge.label}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Reason */}
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>Reason for request</Text>
                      <Text style={styles.reasonText}>{req.reason || 'No reason provided.'}</Text>
                    </View>

                    {/* Expandable Device Info */}
                    <TouchableOpacity style={styles.expandBtn} onPress={() => toggleExpand(req._id)} activeOpacity={0.7}>
                      <View style={styles.expandLeft}>
                        <Smartphone size={16} color={colors.secondary} />
                        <Text style={styles.expandText}>{req.requestedDeviceLabel || 'Unknown Device'}</Text>
                      </View>
                      {isExpanded ? <ChevronUp size={20} color={colors.secondary} /> : <ChevronDown size={20} color={colors.secondary} />}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.expandedContent}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>OS Version:</Text>
                          <Text style={styles.detailValue}>{req.deviceOs || 'N/A'}</Text>
                        </View>
                        {req.deviceFingerprint && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Fingerprint:</Text>
                            <Text style={styles.detailValue}>{req.deviceFingerprint.slice(0, 16)}...</Text>
                          </View>
                        )}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>IP Address:</Text>
                          <Text style={styles.detailValue}>{req.ipAddress || 'Unknown'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Requested On:</Text>
                          <Text style={styles.detailValue}>{new Date(req.createdAt).toLocaleDateString()}</Text>
                        </View>
                      </View>
                    )}

                    {/* Actions (Only if Pending) */}
                    {req.status === 'pending' && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openDecisionModal(req, 'reject')}>
                          <XCircle size={16} color="#ef4444" />
                          <Text style={styles.rejectText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => openDecisionModal(req, 'approve')}>
                          <CheckCircle2 size={16} color="#10b981" />
                          <Text style={styles.approveText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {req.status !== 'pending' && req.decisionNote && (
                      <View style={styles.decisionNoteBox}>
                        <Text style={styles.decisionNoteLabel}>Manager Note:</Text>
                        <Text style={styles.decisionNoteText}>{req.decisionNote}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      <DecisionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${actionType === 'approve' ? 'Approve' : 'Reject'} Device Request`}
        actionType={actionType}
        note={decisionNote}
        setNote={setDecisionNote}
        onConfirm={handleDecision}
      />
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
  
  filtersContainer: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, height: 40, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: colors.textDark },
  
  tabsWrapper: { marginHorizontal: -16 },
  tabsScroll: { paddingHorizontal: 16, gap: 8 },
  filterTab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'transparent' },
  filterTabActive: { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterTabTextActive: { color: colors.primary },
  
  contentArea: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  errorText: { marginTop: 12, fontSize: 14, color: colors.danger, textAlign: 'center', marginBottom: 16 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 8 },
  retryText: { fontWeight: '600', color: colors.textDark },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
  emptyIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textDark, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  employeeName: { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  
  reasonBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 },
  reasonLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  reasonText: { fontSize: 14, color: colors.textDark, fontStyle: 'italic' },
  
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4 },
  expandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expandText: { fontSize: 14, fontWeight: '500', color: colors.textDark },
  
  expandedContent: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginTop: 4, marginBottom: 12, gap: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 12, color: '#64748b' },
  detailValue: { fontSize: 12, fontWeight: '500', color: colors.textDark },
  
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6, borderWidth: 1 },
  rejectBtn: { backgroundColor: '#fef2f2', borderColor: '#fee2e2' },
  approveBtn: { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  rejectText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
  approveText: { color: colors.success, fontWeight: '600', fontSize: 14 },
  
  decisionNoteBox: { marginTop: 12, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: colors.secondary },
  decisionNoteLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 2 },
  decisionNoteText: { fontSize: 13, color: colors.textDark },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.textDark, marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  modalInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15, color: colors.textDark, minHeight: 80, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9' },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  modalCancelText: { fontWeight: '600', color: '#475569', fontSize: 15 },
  modalConfirmText: { fontWeight: '600', color: '#fff', fontSize: 15 },
});

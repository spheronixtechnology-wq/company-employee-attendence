import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MapPin, CheckCircle2, XCircle, Clock, AlertTriangle,
  Search, ChevronLeft, RefreshCw, Check, X,
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';

const colors = {
  primary: '#8b5cf6',
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

export default function ManagerLocationRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);
  const [message, setMessage] = useState(null);

  // Decision modal
  const [decisionModal, setDecisionModal] = useState(null); // { requestId, action, empName }
  const [decisionNote, setDecisionNote] = useState('');

  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    try {
      const res = await managerApi.getLocationRequests(statusFilter);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) setCounts(data.counts);
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage({ type: 'error', text: 'You do not have permission to manage location requests.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load location requests.' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchRequests();
    socket.on('location:request_created', onUpdate);
    socket.on('location:request_resolved', onUpdate);
    return () => {
      socket.off('location:request_created', onUpdate);
      socket.off('location:request_resolved', onUpdate);
    };
  }, [socket, fetchRequests]);

  const onRefresh = () => { setRefreshing(true); fetchRequests(); };

  const handleDecision = async () => {
    if (!decisionModal) return;
    const { requestId, action, empName } = decisionModal;
    setProcessing(requestId + action);
    setDecisionModal(null);
    try {
      await managerApi.decideLocationRequest(requestId, {
        action,
        decisionNote: decisionNote.trim() || null,
      });
      setMessage({
        type: 'success',
        text: `Location request for ${empName || 'employee'} ${action}d successfully.`,
      });
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || `Failed to ${action} request.` });
    } finally {
      setProcessing(null);
      setDecisionNote('');
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        (req.userId?.name?.toLowerCase() || '').includes(term) ||
        (req.userId?.email?.toLowerCase() || '').includes(term) ||
        (req.requestedLocationId?.officeName?.toLowerCase() || '').includes(term) ||
        (req.reason?.toLowerCase() || '').includes(term)
      );
    });
  }, [requests, search]);

  const filterTabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  const getStatusBadgeStyle = (status) => {
    if (status === 'approved') return { bg: '#d1fae5', text: '#065f46', label: 'Approved' };
    if (status === 'rejected') return { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' };
    return { bg: '#fef3c7', text: '#b45309', label: 'Pending' };
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderCard = (req) => {
    const badge = getStatusBadgeStyle(req.status);
    const empName = req.userId?.name || 'Unknown';
    const isPending = req.status === 'pending';
    const isProcessing =
      processing === req._id + 'approve' || processing === req._id + 'reject';

    return (
      <View key={req._id} style={styles.card}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{empName[0]?.toUpperCase() || 'U'}</Text>
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.empName}>{empName}</Text>
            <Text style={styles.empEmail}>{req.userId?.email || '—'}</Text>
            {req.userId?.teamId?.name && (
              <Text style={styles.teamTag}>{req.userId.teamId.name}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Target Office</Text>
            <Text style={styles.detailValue}>
              {req.requestedLocationId?.officeName || 'Unknown Office'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Access Mode</Text>
            <View style={[
              styles.accessBadge,
              { backgroundColor: req.requestType === 'temporary_access' ? '#fef3c7' : '#eff6ff' }
            ]}>
              <Text style={[
                styles.accessBadgeText,
                { color: req.requestType === 'temporary_access' ? '#b45309' : '#1d4ed8' }
              ]}>
                {req.requestType === 'temporary_access' ? 'Temporary' : 'Permanent'}
              </Text>
            </View>
          </View>
          {req.requestedFrom && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>From</Text>
              <Text style={styles.detailValue}>{formatDate(req.requestedFrom)}</Text>
            </View>
          )}
          {req.requestedUntil && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Until</Text>
              <Text style={styles.detailValue}>{formatDate(req.requestedUntil)}</Text>
            </View>
          )}
          {req.reason && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonText}>"{req.reason}"</Text>
            </View>
          )}
          {!isPending && req.decisionNote && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Decision Note</Text>
              <Text style={styles.reasonText}>{req.decisionNote}</Text>
            </View>
          )}
        </View>

        {/* Approve / Reject Actions */}
        {isPending && (
          <View style={styles.actionSection}>
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => { setDecisionNote(''); setDecisionModal({ requestId: req._id, action: 'reject', empName }); }}
                >
                  <X size={15} color={colors.danger} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => { setDecisionNote(''); setDecisionModal({ requestId: req._id, action: 'approve', empName }); }}
                >
                  <Check size={15} color="#fff" />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Location Requests</Text>
            <Text style={styles.headerSubtitle}>Approve team office access requests</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Status Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterTabs.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.filterPill, statusFilter === tab.id && styles.filterPillActive]}
              onPress={() => setStatusFilter(tab.id)}
            >
              <Text style={[styles.filterPillText, statusFilter === tab.id && styles.filterPillTextActive]}>
                {tab.label}
              </Text>
              {tab.count != null && tab.count >= 0 && (
                <View style={[styles.filterCount, statusFilter === tab.id && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, statusFilter === tab.id && { color: colors.primary }]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.secondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search employee, office, reason..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XCircle size={16} color={colors.secondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Message Banner */}
      {message && (
        <View style={[styles.messageBanner, { backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2' }]}>
          {message.type === 'success'
            ? <CheckCircle2 size={15} color={colors.success} />
            : <AlertTriangle size={15} color={colors.danger} />
          }
          <Text style={[styles.messageBannerText, { color: message.type === 'success' ? '#065f46' : '#991b1b' }]}>
            {message.text}
          </Text>
          <TouchableOpacity onPress={() => setMessage(null)} style={{ marginLeft: 'auto' }}>
            <X size={14} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : filteredRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MapPin size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>
            {statusFilter === 'pending' ? 'All Caught Up!' : 'No Location Requests'}
          </Text>
          <Text style={styles.emptyDesc}>
            {statusFilter === 'pending'
              ? 'No pending location requests awaiting approval.'
              : `No ${statusFilter === 'all' ? '' : statusFilter} location requests found.`}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {filteredRequests.map(req => renderCard(req))}
        </ScrollView>
      )}

      {/* Decision Modal */}
      <Modal visible={!!decisionModal} transparent animationType="slide" onRequestClose={() => setDecisionModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {decisionModal?.action === 'approve' ? '✅ Approve' : '❌ Reject'} Location Request
            </Text>
            <Text style={styles.modalSubtitle}>
              {decisionModal?.empName && `For: ${decisionModal.empName}`}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Add a decision note (optional)..."
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
                style={[styles.modalConfirmBtn, {
                  backgroundColor: decisionModal?.action === 'approve' ? colors.success : colors.danger
                }]}
                onPress={handleDecision}
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
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 12, color: colors.secondary, marginTop: 2 },
  refreshBtn: {
    padding: 8, backgroundColor: '#ede9fe', borderRadius: 10,
  },

  filterBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: '#ede9fe', borderColor: colors.primary },
  filterPillText: { fontSize: 13, fontWeight: '600', color: colors.secondary },
  filterPillTextActive: { color: colors.primary },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: '#fff' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: '#64748b' },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },

  messageBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    borderRadius: 12,
  },
  messageBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },

  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingBottom: 40 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0,
  },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: colors.primary },
  cardHeaderInfo: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  empEmail: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  teamTag: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#f1f5f9', borderRadius: 6,
    fontSize: 11, fontWeight: '600', color: colors.secondary,
  },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  detailsBox: {
    backgroundColor: colors.background, borderRadius: 12, padding: 12,
    gap: 8, marginBottom: 12,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'right', flex: 1, marginLeft: 12 },
  accessBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  accessBadgeText: { fontSize: 11, fontWeight: '700' },
  reasonBox: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: colors.secondary, marginBottom: 4, textTransform: 'uppercase' },
  reasonText: { fontSize: 13, color: '#334155', fontStyle: 'italic' },

  actionSection: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  actionRow: { flexDirection: 'row', gap: 10 },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.success,
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: colors.secondary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
    fontSize: 14, color: '#0f172a', backgroundColor: colors.background,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: colors.secondary },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

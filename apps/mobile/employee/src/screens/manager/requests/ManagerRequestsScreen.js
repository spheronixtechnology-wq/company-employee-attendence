import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
  Modal, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar, Smartphone, MapPin, Clock, CheckCircle2,
  XCircle, Filter, ChevronRight, AlertTriangle, ChevronLeft, Search
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';

const colors = {
  primary: '#8b5cf6',
  secondary: '#64748b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  background: '#f8fafc',
  border: '#e2e8f0',
};

// ----------------------------------------------------------------------
// 1. Leave Requests Tab (upgraded with search, filter, socket, leave type)
// ----------------------------------------------------------------------
const LeaveRequestsTab = () => {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionType, setActionType] = useState('approved');

  // Quotas State
  const [leaveQuotas, setLeaveQuotas] = useState({ SL: 0, CL: 0, EL: 0, UL: 0 });
  const [quotasLoading, setQuotasLoading] = useState(false);

  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const [res, quotasRes] = await Promise.all([
        managerApi.getLeaveRequests(filter),
        managerApi.getLeaveQuotas().catch(() => null)
      ]);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) setCounts(data.counts);
      if (quotasRes?.data?.data?.quotas) {
        setLeaveQuotas(quotasRes.data.data.quotas);
      } else if (quotasRes?.data?.data) {
        setLeaveQuotas(quotasRes.data.data);
      }
    } catch (err) {
      setError('Failed to load leave requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleSaveQuotas = async () => {
    try {
      setQuotasLoading(true);
      await managerApi.updateLeaveQuotas(leaveQuotas);
      Alert.alert('Success', 'Team leave quotas updated successfully!');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to save leave quotas');
    } finally {
      setQuotasLoading(false);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onLeave = () => fetchRequests();
    const onQuotasUpdated = (data) => {
      if (data?.quotas) {
        setLeaveQuotas(data.quotas);
      }
    };
    
    socket.on('leave:request_created', onLeave);
    socket.on('leave:request_resolved', onLeave);
    socket.on('leave:quotas_updated', onQuotasUpdated);
    
    return () => {
      socket.off('leave:request_created', onLeave);
      socket.off('leave:request_resolved', onLeave);
      socket.off('leave:quotas_updated', onQuotasUpdated);
    };
  }, [socket, fetchRequests]);

  const onRefresh = () => { setRefreshing(true); fetchRequests(); };

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
      await managerApi.decideLeaveRequest(selectedRequest._id, actionType, decisionNote);
      Alert.alert('Success', `Leave request ${actionType} successfully.`);
      fetchRequests();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || `Failed to ${actionType} request.`);
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'approved') return { bg: '#d1fae5', text: '#065f46', label: 'Approved' };
    if (status === 'rejected') return { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' };
    return { bg: '#fef3c7', text: '#b45309', label: 'Pending' };
  };

  const filteredRequests = (requests || []).filter(req => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (req.userId?.name?.toLowerCase() || '').includes(q) ||
      (req.userId?.email?.toLowerCase() || '').includes(q) ||
      (req.leaveTypeId?.name?.toLowerCase() || '').includes(q) ||
      (req.reason?.toLowerCase() || '').includes(q)
    );
  });

  const filterTabs = [
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'all', label: 'All', count: counts.all || counts.total },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  if (loading && !refreshing) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchRequests} />;

  return (
    <View style={styles.tabContainer}>
      
      {/* ── Premium Team Leave Configuration ── */}
      <View style={styles.allocationBanner}>
        <View style={styles.allocationHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.allocationTitle}>Team Leave Allocation</Text>
            <Text style={styles.allocationSubtitle}>Configure default annual leave limits for your team.</Text>
          </View>
          <TouchableOpacity 
            style={styles.saveQuotasBtn} 
            onPress={handleSaveQuotas}
            disabled={quotasLoading}
          >
            {quotasLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveQuotasText}>SAVE LIMITS</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.quotasGrid}>
          {[
            { id: 'SL', label: 'SICK LEAVE', color: '#f43f5e' },
            { id: 'CL', label: 'CASUAL LEAVE', color: '#0ea5e9' },
            { id: 'EL', label: 'EARNED LEAVE', color: '#10b981' },
            { id: 'UL', label: 'UNPAID LEAVE', color: '#64748b' }
          ].map(leave => (
            <View key={leave.id} style={styles.quotaBox}>
              <View style={styles.quotaHeader}>
                <View style={[styles.quotaDot, { backgroundColor: leave.color }]} />
                <Text style={styles.quotaLabel}>{leave.label}</Text>
              </View>
              <View style={styles.quotaInputRow}>
                <TextInput
                  style={styles.quotaInput}
                  keyboardType="numeric"
                  value={String(leaveQuotas[leave.id] || 0)}
                  onChangeText={v => setLeaveQuotas(p => ({ ...p, [leave.id]: parseInt(v) || 0 }))}
                />
                <Text style={styles.quotaDaysText}>days</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Status Filter Tabs */}
      <View style={styles.filterTabsBar}>
        {filterTabs.map(ft => (
          <TouchableOpacity
            key={ft.id}
            style={[styles.filterTabPill, filter === ft.id && styles.filterTabPillActive]}
            onPress={() => setFilter(ft.id)}
          >
            <Text style={[styles.filterTabPillText, filter === ft.id && styles.filterTabPillTextActive]}>
              {ft.label}
            </Text>
            {ft.count != null && ft.count > 0 && (
              <View style={[styles.filterCountBadge, filter === ft.id && styles.filterCountBadgeActive]}>
                <Text style={[styles.filterCountText, filter === ft.id && { color: colors.primary }]}>{ft.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.leaveSearchRow}>
        <Search size={15} color={colors.secondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.leaveSearchInput}
          placeholder="Search name, leave type, reason..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XCircle size={15} color={colors.secondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {filteredRequests.length === 0 ? (
          <EmptyState icon={Calendar} title="No Leave Requests" subtitle={filter === 'pending' ? 'All caught up!' : `No ${filter} requests found.`} />
        ) : (
          filteredRequests.map(req => {
            const badge = getStatusBadge(req.status);
            return (
              <View key={req._id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.employeeName}>{req.userId?.name || 'Unknown'}</Text>
                    <Text style={styles.dateText}>
                      {req.leaveTypeId?.name ? `${req.leaveTypeId.name} · ` : ''}
                      {new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={styles.reasonText}>Reason: {req.reason || 'N/A'}</Text>

                {req.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openDecisionModal(req, 'rejected')}>
                      <XCircle size={16} color="#ef4444" />
                      <Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => openDecisionModal(req, 'approved')}>
                      <CheckCircle2 size={16} color="#10b981" />
                      <Text style={styles.approveText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <DecisionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${actionType === 'approved' ? 'Approve' : 'Reject'} Leave Request`}
        actionType={actionType}
        note={decisionNote}
        setNote={setDecisionNote}
        onConfirm={handleDecision}
      />
    </View>
  );
};

// ----------------------------------------------------------------------
// 2. Device Requests Tab
// ----------------------------------------------------------------------
const DeviceRequestsTab = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionType, setActionType] = useState('approve'); // 'approve' | 'reject'

  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const res = await managerApi.getDeviceRequests('pending');
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      setError('Failed to load device requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
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

  if (loading && !refreshing) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchRequests} />;

  return (
    <View style={styles.tabContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {requests.length === 0 ? (
          <EmptyState icon={Smartphone} title="No Device Requests" subtitle="All caught up!" />
        ) : (
          requests.map(req => (
            <View key={req._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.employeeName}>{req.userId?.name || 'Unknown'}</Text>
                  <Text style={styles.subtitle}>{req.requestedDeviceLabel || 'Unknown Device'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#e0e7ff' }]}>
                  <Text style={[styles.badgeText, { color: '#4338ca' }]}>{req.requestType}</Text>
                </View>
              </View>
              <Text style={styles.reasonText}>Reason: {req.reason || 'N/A'}</Text>
              
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
            </View>
          ))
        )}
      </ScrollView>

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
};

// ----------------------------------------------------------------------
// 3. Location Requests Tab
// ----------------------------------------------------------------------
const LocationRequestsTab = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionType, setActionType] = useState('approve'); // 'approve' | 'reject'

  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const res = await managerApi.getLocationRequests('pending');
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      setError('Failed to load location requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
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
      await managerApi.decideLocationRequest(selectedRequest._id, { action: actionType, decisionNote });
      Alert.alert('Success', `Location request ${actionType}d successfully.`);
      fetchRequests();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || `Failed to ${actionType} request.`);
      setLoading(false);
    }
  };

  if (loading && !refreshing) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchRequests} />;

  return (
    <View style={styles.tabContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {requests.length === 0 ? (
          <EmptyState icon={MapPin} title="No Location Requests" subtitle="All caught up!" />
        ) : (
          requests.map(req => (
            <View key={req._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.employeeName}>{req.userId?.name || 'Unknown'}</Text>
                  <Text style={styles.subtitle}>{req.requestedLocationId?.officeName || 'Target Office'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={[styles.badgeText, { color: '#166534' }]}>{req.requestType === 'temporary_access' ? 'Temp' : 'Permanent'}</Text>
                </View>
              </View>
              <Text style={styles.reasonText}>Reason: {req.reason || 'N/A'}</Text>
              
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
            </View>
          ))
        )}
      </ScrollView>

      <DecisionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${actionType === 'approve' ? 'Approve' : 'Reject'} Location Request`}
        actionType={actionType}
        note={decisionNote}
        setNote={setDecisionNote}
        onConfirm={handleDecision}
      />
    </View>
  );
};

// ----------------------------------------------------------------------
// 4. Manual Attendance Tab
// ----------------------------------------------------------------------
const ManualAttendanceTab = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionType, setActionType] = useState('approve');

  const fetchRequests = useCallback(async () => {
    try {
      setError(null);
      const today = new Date().toISOString().split('T')[0];
      const res = await managerApi.getTeamAttendanceRoster(today);
      const roster = res.data?.data?.records || [];
      
      // Zero-Regression exactly matching Web Manager's filter
      const manualPending = roster.filter(r => 
        r.status === 'manual_pending' || (r.manualRequest && r.manualRequest.status === 'pending')
      );
      setRequests(manualPending);
    } catch (err) {
      setError('Failed to load manual attendance roster.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
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
      // The API expects the manual request ID. If the record itself is the request, use _id.
      // If it's embedded, use manualRequest._id
      const requestId = selectedRequest.manualRequest?._id || selectedRequest._id;
      
      await managerApi.decideManualAttendance(requestId, { action: actionType, decisionNote });
      Alert.alert('Success', `Manual attendance ${actionType}d successfully.`);
      fetchRequests();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || `Failed to ${actionType} request.`);
      setLoading(false);
    }
  };

  if (loading && !refreshing) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchRequests} />;

  return (
    <View style={styles.tabContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {requests.length === 0 ? (
          <EmptyState icon={Clock} title="No Manual Attendance" subtitle="No pending check-ins!" />
        ) : (
          requests.map(req => (
            <View key={req._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.employeeName}>{req.userId?.name || 'Unknown'}</Text>
                  <Text style={styles.dateText}>{req.date ? new Date(req.date).toLocaleDateString() : 'Today'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.badgeText, { color: '#b45309' }]}>Review</Text>
                </View>
              </View>
              <Text style={styles.reasonText}>Reason: {req.manualRequest?.reason || req.reason || 'N/A'}</Text>
              
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
            </View>
          ))
        )}
      </ScrollView>

      <DecisionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${actionType === 'approve' ? 'Approve' : 'Reject'} Attendance`}
        actionType={actionType}
        note={decisionNote}
        setNote={setDecisionNote}
        onConfirm={handleDecision}
      />
    </View>
  );
};

// ----------------------------------------------------------------------
// Shared UI Components
// ----------------------------------------------------------------------
const LoadingState = () => (
  <View style={styles.centerContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.loadingText}>Loading requests...</Text>
  </View>
);

const ErrorState = ({ error, onRetry }) => (
  <View style={styles.centerContainer}>
    <AlertTriangle size={32} color="#ef4444" />
    <Text style={styles.errorText}>{error}</Text>
    <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
      <Text style={styles.retryText}>Retry</Text>
    </TouchableOpacity>
  </View>
);

const EmptyState = ({ icon: Icon, title, subtitle }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconBg}>
      <Icon size={32} color={colors.primary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySubtitle}>{subtitle}</Text>
  </View>
);

const DecisionModal = ({ visible, onClose, title, actionType, note, setNote, onConfirm }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalSubtitle}>Please provide a reason for this decision (optional for approvals).</Text>
        
        <TextInput
          style={styles.modalInput}
          placeholder="Enter decision note..."
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
            style={[styles.modalConfirmBtn, actionType.includes('reject') ? { backgroundColor: '#ef4444' } : { backgroundColor: '#10b981' }]} 
            onPress={onConfirm}
          >
            <Text style={styles.modalConfirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ----------------------------------------------------------------------
// Main Screen Shell
// ----------------------------------------------------------------------
export default function ManagerRequestsScreen({ navigation, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'leave');

  const tabs = [
    { id: 'leave', label: 'Leave' },
    { id: 'location', label: 'Location' },
    { id: 'manual', label: 'Manual' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Requests</Text>
      </View>
      </SafeAreaView>

      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, activeTab === tab.id && styles.activeTabButton]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabButtonText, activeTab === tab.id && styles.activeTabButtonText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.contentArea}>
        {activeTab === 'leave' && <LeaveRequestsTab />}
        {activeTab === 'location' && <LocationRequestsTab />}
        {activeTab === 'manual' && <ManualAttendanceTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9' 
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  
  tabsWrapper: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabsContainer: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f1f5f9' },
  activeTabButton: { backgroundColor: colors.primary },
  tabButtonText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  activeTabButtonText: { color: '#fff' },
  
  contentArea: { flex: 1 },
  tabContainer: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  errorText: { marginTop: 12, fontSize: 14, color: '#ef4444', textAlign: 'center', marginBottom: 16 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 8 },
  retryText: { fontWeight: '600', color: '#0f172a' },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
  emptyIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: '#64748b' },
  
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  employeeName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  dateText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  subtitle: { fontSize: 13, color: '#475569', marginTop: 2, fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  reasonText: { fontSize: 13, color: '#334155', fontStyle: 'italic', marginBottom: 16, backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 },
  
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6, borderWidth: 1 },
  rejectBtn: { backgroundColor: '#fef2f2', borderColor: '#fee2e2' },
  approveBtn: { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  rejectText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  approveText: { color: '#10b981', fontWeight: '600', fontSize: 14 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  modalInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', minHeight: 80, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  modalCancelText: { fontWeight: '600', color: '#475569', fontSize: 15 },
  modalConfirmText: { fontWeight: '600', color: '#fff', fontSize: 15 },
  // Leave filter pills
  filterTabsBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', gap: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  filterTabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterTabPillActive: { backgroundColor: '#ede9fe', borderColor: colors.primary },
  filterTabPillText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterTabPillTextActive: { color: colors.primary },
  filterCountBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountBadgeActive: { backgroundColor: '#fff' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  // Leave search
  leaveSearchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  leaveSearchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  
  // Leave Allocation Banner (Premium CSS)
  allocationBanner: {
    backgroundColor: '#ffffff',
    margin: 16,
    marginBottom: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  allocationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  allocationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  allocationSubtitle: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
    paddingRight: 8,
  },
  saveQuotasBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveQuotasText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  quotasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quotaBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  quotaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  quotaInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quotaInput: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    padding: 0,
    margin: 0,
    minWidth: 40,
  },
  quotaDaysText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 4,
  },
});

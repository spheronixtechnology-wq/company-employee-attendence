import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  ClipboardList,
  AlertCircle,
  Smartphone,
  ChevronRight,
  LogOut,
  RefreshCw
} from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { useSocket } from '../../../contexts/SocketContext';
import { managerApi } from '../../../services/api/managerApi';

export default function ManagerDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dashboardData, setDashboardData] = useState(null);
  const [members, setMembers] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [pendingDevices, setPendingDevices] = useState([]);

  const dateStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const fetchDashboardData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else if (!dashboardData) setLoading(true);

    try {
      // Fetch sections independently so one failure doesn't block others
      managerApi.getDashboard(dateStr)
        .then(res => setDashboardData(res.data?.data))
        .catch(console.error);

      managerApi.getTeamMembers(dateStr)
        .then(res => setMembers(res.data?.data?.members || []))
        .catch(console.error);

      managerApi.getPendingLeaves()
        .then(res => setPendingLeaves(res.data?.data?.requests?.slice(0, 3) || []))
        .catch(() => {});

      managerApi.getPendingDevices()
        .then(res => setPendingDevices(res.data?.data?.requests?.slice(0, 3) || []))
        .catch(() => {});
        
    } finally {
      // Simulate settling time for parallel disjointed calls
      setTimeout(() => {
        setLoading(false);
        setRefreshing(false);
      }, 500);
    }
  }, [dateStr, dashboardData]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Real-time Socket Updates
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchDashboardData();
    
    socket.on('attendance:checked_in', onUpdate);
    socket.on('attendance:checked_out', onUpdate);
    socket.on('leave:request_created', onUpdate);
    socket.on('device:request_created', onUpdate);

    return () => {
      socket.off('attendance:checked_in', onUpdate);
      socket.off('attendance:checked_out', onUpdate);
      socket.off('leave:request_created', onUpdate);
      socket.off('device:request_created', onUpdate);
    };
  }, [socket, fetchDashboardData]);

  const metrics = dashboardData?.metrics || {
    totalEmployees: 0,
    present: 0,
    absent: 0,
    late: 0
  };

  const formatHrs = (ms) => {
    if (!ms || isNaN(ms)) return '0h 0m';
    const totalMins = Math.floor(ms / 60000);
    const hrs = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${hrs}h ${m}m`;
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>Manager Portal</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <LogOut size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDashboardData(true)} />}
      >
        <View style={styles.greetingRow}>
          <Text style={styles.greetingText}>Welcome, {user?.firstName}!</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
        </View>

        {/* KPIs */}
        <Text style={styles.sectionTitle}>Today's Overview</Text>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderTopColor: '#0ea5e9' }]}>
            <Users size={24} color="#0ea5e9" />
            <Text style={styles.kpiValue}>{metrics.totalEmployees}</Text>
            <Text style={styles.kpiLabel}>Total</Text>
          </View>
          <View style={[styles.kpiCard, { borderTopColor: '#10b981' }]}>
            <CheckCircle size={24} color="#10b981" />
            <Text style={styles.kpiValue}>{metrics.present}</Text>
            <Text style={styles.kpiLabel}>Present</Text>
          </View>
          <View style={[styles.kpiCard, { borderTopColor: '#ef4444' }]}>
            <XCircle size={24} color="#ef4444" />
            <Text style={styles.kpiValue}>{metrics.absent}</Text>
            <Text style={styles.kpiLabel}>Absent</Text>
          </View>
          <View style={[styles.kpiCard, { borderTopColor: '#f59e0b' }]}>
            <Clock size={24} color="#f59e0b" />
            <Text style={styles.kpiValue}>{metrics.late}</Text>
            <Text style={styles.kpiLabel}>Late</Text>
          </View>
        </View>

        {/* Pending Approvals Quick-View */}
        {(pendingLeaves.length > 0 || pendingDevices.length > 0) && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Pending Approvals</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Requests')}>
                <Text style={styles.linkText}>View All</Text>
              </TouchableOpacity>
            </View>
            
            {pendingLeaves.map(req => (
              <View key={req._id} style={styles.approvalItem}>
                <View style={styles.approvalIcon}>
                  <ClipboardList size={20} color="#f59e0b" />
                </View>
                <View style={styles.approvalInfo}>
                  <Text style={styles.approvalTitle}>Leave Request</Text>
                  <Text style={styles.approvalSub}>{req.user?.firstName} {req.user?.lastName}</Text>
                </View>
                <ChevronRight size={20} color="#94a3b8" />
              </View>
            ))}

            {pendingDevices.map(req => (
              <View key={req._id} style={styles.approvalItem}>
                <View style={styles.approvalIcon}>
                  <Smartphone size={20} color="#8b5cf6" />
                </View>
                <View style={styles.approvalInfo}>
                  <Text style={styles.approvalTitle}>Device Replacement</Text>
                  <Text style={styles.approvalSub}>{req.user?.firstName} {req.user?.lastName}</Text>
                </View>
                <ChevronRight size={20} color="#94a3b8" />
              </View>
            ))}
          </View>
        )}

        {/* Team Work Hours */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Team Work Hours</Text>
          </View>
          {members.length === 0 ? (
            <Text style={styles.emptyText}>No team members found.</Text>
          ) : (
            members.map(member => (
              <View key={member._id} style={styles.memberRow}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.user?.firstName} {member.user?.lastName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: member.todayStatus === 'Present' ? '#dcfce7' : '#f1f5f9' }]}>
                    <Text style={[styles.statusText, { color: member.todayStatus === 'Present' ? '#16a34a' : '#64748b' }]}>
                      {member.todayStatus}
                    </Text>
                  </View>
                </View>
                <View style={styles.memberStats}>
                  <Text style={styles.statTime}>{formatHrs(member.todayRecord?.workHours)}</Text>
                  <Text style={styles.statLabel}>Work</Text>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  logoutBtn: {
    padding: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  greetingRow: {
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#64748b',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  kpiCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderTopWidth: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    marginVertical: 8,
  },
  kpiLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  approvalIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  approvalInfo: {
    flex: 1,
  },
  approvalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 2,
  },
  approvalSub: {
    fontSize: 13,
    color: '#64748b',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberStats: {
    alignItems: 'flex-end',
  },
  statTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  }
});

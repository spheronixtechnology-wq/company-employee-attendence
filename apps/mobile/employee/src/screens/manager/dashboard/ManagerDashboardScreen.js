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
  Modal,
  Platform,
  StatusBar
} from 'react-native';
import {
  Users,
  UserCheck,
  Calendar,
  ClipboardList,
  AlertCircle,
  ChevronRight,
  LogOut,
  ChevronLeft,
  RefreshCw,
  Smartphone,
  CheckCircle,
  CalendarDays,
  FileText,
  Settings,
  UserCircle2,
  ShieldAlert,
  Clock,
  Menu,
  LayoutDashboard,
  MapPin,
  Wifi,
  ChevronDown,
  ShieldCheck,
  Briefcase
} from 'lucide-react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useAuth } from '../../../contexts/AuthContext';
import { useSocket } from '../../../contexts/SocketContext';
import { managerApi } from '../../../services/api/managerApi';
import { SafeAreaView } from 'react-native-safe-area-context';
import Member360ProfileModal from '../../../components/Member360ProfileModal';

const colors = {
  primary: '#8b5cf6', // Violet matching Web UI
  primaryLight: '#ede9fe',
  success: '#10b981',
  successLight: '#d1fae5',
  danger: '#f43f5e',
  dangerLight: '#ffe4e6',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  background: '#f8fafc',
  card: '#ffffff',
  textDark: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
};

const DonutChart = ({ data, centerLabel, centerValue }) => {
  const radius = 65;
  const strokeWidth = 20;
  const center = radius + strokeWidth;
  const circumference = 2 * Math.PI * radius;
  
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let strokeDashoffsetAcc = 0;

  return (
    <View style={styles.donutContainer}>
      <Svg width={center * 2} height={center * 2}>
        {/* Background track */}
        <Circle cx={center} cy={center} r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="none" />
        <G rotation="-90" origin={`${center}, ${center}`}>
          {data.map((item, index) => {
            if (item.value === 0) return null;
            const strokeLength = (item.value / total) * circumference;
            const strokeDasharray = `${strokeLength} ${circumference}`;
            const strokeDashoffset = -strokeDashoffsetAcc;
            strokeDashoffsetAcc += strokeLength;
            return (
              <Circle
                key={index}
                cx={center}
                cy={center}
                r={radius}
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </G>
      </Svg>
      <View style={styles.donutCenterLabel}>
        <Text style={styles.donutValueText}>{centerValue}</Text>
        <Text style={styles.donutLabelText}>{centerLabel}</Text>
      </View>
    </View>
  );
};

export default function ManagerDashboardScreen({ onNavigate }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionProcessing, setActionProcessing] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [profileModal, setProfileModal] = useState(null); // Added for 360 profile

  const [currentDate, setCurrentDate] = useState(new Date());

  const [dashboardData, setDashboardData] = useState(null);
  const [members, setMembers] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [pendingDevices, setPendingDevices] = useState([]);

  const dateStr = useMemo(() => {
    const d = currentDate;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate]);

  const isToday = useMemo(() => {
    const today = new Date();
    return dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [dateStr]);

  const fetchDashboardData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else if (!dashboardData) setLoading(true);

    try {
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
    socket.on('leave:request_resolved', onUpdate);
    socket.on('device:request_created', onUpdate);
    socket.on('device:request_resolved', onUpdate);

    return () => {
      socket.off('attendance:checked_in', onUpdate);
      socket.off('attendance:checked_out', onUpdate);
      socket.off('leave:request_created', onUpdate);
      socket.off('leave:request_resolved', onUpdate);
      socket.off('device:request_created', onUpdate);
      socket.off('device:request_resolved', onUpdate);
    };
  }, [socket, fetchDashboardData]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleLeaveDecision = async (id, status) => {
    setActionProcessing(id);
    try {
      await managerApi.decideLeaveRequest(id, status);
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setActionProcessing(null);
    }
  };

  const handleDeviceDecision = async (id, action) => {
    setActionProcessing(id);
    try {
      await managerApi.decideDeviceRequest(id, action);
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setActionProcessing(null);
    }
  };

  const formatHrs = (ms) => {
    if (!ms || isNaN(ms)) return '—';
    const totalMins = Math.floor(ms / 60000);
    const hrs = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${hrs}h ${m}m`;
  };

  const donutData = useMemo(() => [
    { name: 'Checked In', value: dashboardData?.checkedIn || 0, color: colors.success },
    { name: 'Not Checked In', value: dashboardData?.notCheckedIn || 0, color: colors.danger },
    { name: 'On Leave', value: dashboardData?.onLeave || 0, color: colors.warning },
    { name: 'Missing Logs', value: dashboardData?.missingDailyLogs || 0, color: colors.primary },
  ], [dashboardData]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* ── 1. Top Brand Header Bar ── */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <Image
            source={require('../../../../assets/logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.brandRight}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel="Open Navigation Drawer"
          >
            <Menu size={24} color="#334155" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDashboardData(true)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. Greeting Header & Active Mode Badge ── */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingTitleRow}>
            <Text style={styles.greetingTitle}>
              Good {getGreeting()}, {user?.name?.split(' ')[0] || 'Manager'} 👋
            </Text>
          </View>
          
          {/* Active Mode Pill Removed */}
          
          <Text style={styles.greetingSubtitle}>
            Live presence & quick management actions
          </Text>
        </View>

        {/* ── 3. Date Control Strip ── */}
        <View style={styles.dateControlRow}>
          <View style={styles.dateControlLeft}>
            <View style={styles.viewModeDropdown}>
              <Text style={styles.viewModeText}>Day</Text>
              <ChevronDown size={14} color="#64748b" />
            </View>

            <View style={styles.dateNavigator}>
              <TouchableOpacity onPress={handlePrevDate} style={styles.dateChevronBtn}>
                <ChevronLeft size={16} color="#64748b" />
              </TouchableOpacity>
              <View style={styles.dateCenter}>
                <Calendar size={13} color="#7c3aed" />
                <Text style={styles.dateCenterText}>
                  {currentDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity onPress={handleNextDate} style={styles.dateChevronBtn}>
                <ChevronRight size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.refreshIconBtn} onPress={() => fetchDashboardData(true)}>
            <RefreshCw size={15} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* ── 4. Secondary Horizontal Tab Strip Removed ── */}
        {/* ── 6 KPI Tiles Ribbon ── */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiTile, { borderTopColor: colors.primary }]}>
            <View style={styles.kpiIconWrapper}><Users size={18} color={colors.primary} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.teamTotal || 0}</Text>
            <Text style={styles.kpiLabel}>Team Total</Text>
          </View>
          <View style={[styles.kpiTile, { borderTopColor: colors.success }]}>
            <View style={styles.kpiIconWrapper}><UserCheck size={18} color={colors.success} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.checkedIn || 0}</Text>
            <Text style={styles.kpiLabel}>Checked In</Text>
          </View>
          <View style={[styles.kpiTile, { borderTopColor: colors.danger }]}>
            <View style={styles.kpiIconWrapper}><AlertCircle size={18} color={colors.danger} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.notCheckedIn || 0}</Text>
            <Text style={styles.kpiLabel}>Not Checked In</Text>
          </View>
          <View style={[styles.kpiTile, { borderTopColor: colors.warning }]}>
            <View style={styles.kpiIconWrapper}><Calendar size={18} color={colors.warning} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.onLeave || 0}</Text>
            <Text style={styles.kpiLabel}>On Leave</Text>
          </View>
          <View style={[styles.kpiTile, { borderTopColor: colors.danger }]}>
            <View style={styles.kpiIconWrapper}><AlertCircle size={18} color={colors.danger} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.missingDailyLogs || 0}</Text>
            <Text style={styles.kpiLabel}>Missing Logs</Text>
          </View>
          <View style={[styles.kpiTile, { borderTopColor: colors.warning }]}>
            <View style={styles.kpiIconWrapper}><ClipboardList size={18} color={colors.warning} /></View>
            <Text style={styles.kpiValue}>{dashboardData?.pendingLeaveRequests || 0}</Text>
            <Text style={styles.kpiLabel}>Pending Leaves</Text>
          </View>
        </View>


        {/* ── Donut Chart Panel ── */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Team Attendance {isToday ? 'Today' : ''}</Text>
            <View style={styles.panelBadge}>
              <Text style={styles.panelBadgeText}>{isToday ? 'Live' : 'Archive'}</Text>
            </View>
          </View>
          <Text style={styles.panelSubtitle}>Distribution of assigned workforce</Text>
          
          <DonutChart 
            data={donutData} 
            centerValue={`${dashboardData?.checkedIn || 0}/${dashboardData?.teamTotal || 0}`}
            centerLabel="Checked In"
          />

          <View style={styles.legendContainer}>
            {donutData.map((d, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: d.color }]} />
                <Text style={styles.legendLabel}>{d.name} ({d.value})</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Pending Approvals Quick Resolution Panel ── */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Pending Approvals</Text>
            {pendingLeaves.length + pendingDevices.length > 0 && (
              <TouchableOpacity onPress={() => onNavigate('requests')}>
                <Text style={styles.linkText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>

          {pendingLeaves.length === 0 && pendingDevices.length === 0 ? (
            <View style={styles.emptyState}>
              <CheckCircle size={32} color={colors.successLight} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyStateTitle}>All caught up!</Text>
              <Text style={styles.emptyStateSub}>No pending leaves or device approvals.</Text>
            </View>
          ) : (
            <View style={styles.approvalsList}>
              {pendingLeaves.map(req => (
                <View key={`leave-${req._id}`} style={styles.approvalItem}>
                  <View style={styles.approvalItemTop}>
                    <View style={[styles.approvalIcon, { backgroundColor: colors.warningLight }]}>
                      <Calendar size={18} color={colors.warning} />
                    </View>
                    <View style={styles.approvalItemInfo}>
                      <Text style={styles.approvalItemTitle}>{req.userId?.name || 'Employee'}</Text>
                      <Text style={styles.approvalItemSub}>Leave Request</Text>
                    </View>
                  </View>
                  <View style={styles.approvalActions}>
                    <TouchableOpacity
                      disabled={actionProcessing === req._id}
                      onPress={() => handleLeaveDecision(req._id, 'rejected')}
                      style={[styles.actionBtn, styles.rejectBtn]}
                    >
                      {actionProcessing === req._id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.rejectBtnText}>Reject</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={actionProcessing === req._id}
                      onPress={() => handleLeaveDecision(req._id, 'approved')}
                      style={[styles.actionBtn, styles.approveBtn]}
                    >
                      {actionProcessing === req._id ? <ActivityIndicator size="small" color={colors.success} /> : <Text style={styles.approveBtnText}>Approve</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {pendingDevices.map(req => (
                <View key={`dev-${req._id}`} style={styles.approvalItem}>
                  <View style={styles.approvalItemTop}>
                    <View style={[styles.approvalIcon, { backgroundColor: colors.primaryLight }]}>
                      <Smartphone size={18} color={colors.primary} />
                    </View>
                    <View style={styles.approvalItemInfo}>
                      <Text style={styles.approvalItemTitle}>{req.userId?.name || 'Employee'}</Text>
                      <Text style={styles.approvalItemSub}>Device Reset</Text>
                    </View>
                  </View>
                  <View style={styles.approvalActions}>
                    <TouchableOpacity
                      disabled={actionProcessing === req._id}
                      onPress={() => handleDeviceDecision(req._id, 'reject')}
                      style={[styles.actionBtn, styles.rejectBtn]}
                    >
                      {actionProcessing === req._id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.rejectBtnText}>Reject</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={actionProcessing === req._id}
                      onPress={() => handleDeviceDecision(req._id, 'approve')}
                      style={[styles.actionBtn, styles.approveBtn]}
                    >
                      {actionProcessing === req._id ? <ActivityIndicator size="small" color={colors.success} /> : <Text style={styles.approveBtnText}>Approve</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Work Hours & Live Activity List ── */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Work Hours & Activity</Text>
            <View style={styles.panelBadge}>
              <Text style={styles.panelBadgeText}>{members.length} Members</Text>
            </View>
          </View>

          {members.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateSub}>No team members found for this date.</Text>
            </View>
          ) : (
            <View style={styles.tableList}>
              {members.map(m => {
                const isCheckedIn = m.currentStatus === 'checked_in';
                const isCheckedOut = m.currentStatus === 'checked_out';
                const isOnBreak = m.currentStatus === 'on_break';
                const isAbsent = !isCheckedIn && !isCheckedOut && !isOnBreak;
                
                let statusColor = colors.textMuted;
                let statusBg = '#f1f5f9';
                let statusLabel = 'Absent';

                if (isCheckedIn) { statusColor = colors.success; statusBg = colors.successLight; statusLabel = 'Checked In'; }
                else if (isCheckedOut) { statusColor = '#0284c7'; statusBg = '#e0f2fe'; statusLabel = 'Checked Out'; }
                else if (isOnBreak) { statusColor = colors.warning; statusBg = colors.warningLight; statusLabel = 'On Break'; }

                return (
                  <TouchableOpacity 
                    key={m._id} 
                    style={[styles.premiumCard, { borderLeftColor: statusColor }]}
                    activeOpacity={0.8}
                    onPress={() => setProfileModal(m)}
                  >
                    <View style={styles.premiumCardHeader}>
                      <View style={styles.premiumAvatarContainer}>
                        <View style={[styles.premiumAvatar, { backgroundColor: statusBg }]}>
                          {m.avatarUrl ? (
                            <Image source={{ uri: m.avatarUrl }} style={styles.premiumAvatarImg} />
                          ) : (
                            <Text style={[styles.premiumAvatarText, { color: statusColor }]}>{m.name?.[0]?.toUpperCase() || 'U'}</Text>
                          )}
                        </View>
                        {isCheckedIn && <View style={styles.premiumActiveIndicator} />}
                      </View>
                      <View style={styles.premiumUserInfo}>
                        <Text style={styles.premiumUserName}>{m.name}</Text>
                        <Text style={[styles.premiumUserStatus, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                      <View style={styles.premiumLogBadge}>
                        {m.dailyLogSubmitted ? (
                          <View style={styles.logBadgeSuccess}><Text style={styles.logBadgeSuccessText}>Logged</Text></View>
                        ) : isCheckedIn ? (
                          <View style={styles.logBadgeWarning}><Text style={styles.logBadgeWarningText}>Pending</Text></View>
                        ) : (
                          <View style={styles.logBadgeMuted}><Text style={styles.logBadgeMutedText}>No Log</Text></View>
                        )}
                      </View>
                    </View>

                    <View style={styles.premiumStatsRow}>
                      <View style={styles.premiumStatBox}>
                        <Clock size={14} color="#64748b" style={{ marginBottom: 4 }} />
                        <Text style={styles.premiumStatLabel}>Check-In</Text>
                        <Text style={styles.premiumStatValue}>
                          {m.checkInTime ? new Date(m.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </Text>
                      </View>
                      <View style={styles.premiumStatDivider} />
                      <View style={styles.premiumStatBox}>
                        <Briefcase size={14} color="#64748b" style={{ marginBottom: 4 }} />
                        <Text style={styles.premiumStatLabel}>Work Hrs</Text>
                        <Text style={[styles.premiumStatValue, isCheckedIn && { color: colors.primary }]}>
                          {m.totalWorkMinutes ? formatHrs(m.totalWorkMinutes * 60000) : (isCheckedIn ? 'Running' : '—')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Logout Button */}
      <TouchableOpacity onPress={logout} style={styles.fabLogout}>
        <LogOut size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* Slide-out Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.menuDrawer}>
            <View style={styles.menuDrawerProfile}>
              <View style={styles.drawerAvatar}>
                {(user?.profileImage || user?.avatarUrl) ? (
                  <Image source={{ uri: user.profileImage || user.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                  <Text style={styles.drawerAvatarText}>{user?.name?.charAt(0) || 'M'}</Text>
                )}
              </View>
              <View>
                <Text style={styles.drawerName}>{user?.name || 'Manager'}</Text>
                <Text style={styles.drawerRole}>{user?.role?.toUpperCase() || 'MANAGER'}</Text>
              </View>
            </View>
            <View style={styles.menuDrawerHeader}>
              <Text style={styles.menuDrawerTitle}>Manager Sections</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.closeMenuBtn}>
                <LogOut size={20} color={colors.textDark} style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.menuScroll}>
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: colors.primary },
                { id: 'team-members', label: 'Team Members', icon: Users, color: '#6366f1' },
                { id: 'team-attendance', label: 'Team Attendance', icon: UserCheck, color: '#3b82f6' },
                { id: 'session-reactivations', label: 'Session Reactivations', icon: ShieldCheck, color: '#8b5cf6' },
                { id: 'team-overtime', label: 'Overtime', icon: Clock, color: colors.success },
                { id: 'team-daily-logs', label: 'Daily Logs', icon: FileText, color: '#06b6d4' },
                { id: 'leave-requests', label: 'Leave Requests', icon: Clock, color: colors.warning },
                { id: 'device-requests', label: 'Device Approvals', icon: ShieldAlert, color: '#f97316' },
                { id: 'location-requests', label: 'Location Requests', icon: MapPin, color: '#ec4899' },
                { id: 'attendance-method', label: 'Attendance Method', icon: ShieldCheck, color: '#8b5cf6' },
                { id: 'office-locations', label: 'Office Locations', icon: MapPin, color: '#ec4899' },
                { id: 'wifi-settings', label: 'WiFi / IP Settings', icon: Wifi, color: '#14b8a6' },
                { id: 'manager-profile', label: 'My Profile', icon: UserCircle2, color: '#eab308' }
              ].map(item => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity 
                    key={item.id} 
                    style={styles.menuItem} 
                    onPress={() => {
                      setMenuVisible(false);
                      onNavigate(item.id);
                    }}
                  >
                    <View style={[styles.menuItemIcon, { backgroundColor: item.color + '20' }]}>
                      <Icon size={20} color={item.color} />
                    </View>
                    <Text style={styles.menuItemText}>{item.label}</Text>
                    <ChevronRight size={16} color={colors.border} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  // Header Styles
  headerContainer: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuBtn: {
    padding: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  dateControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 4,
    marginRight: 12,
  },
  dateArrowBtn: {
    padding: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginHorizontal: 8,
    minWidth: 90,
    textAlign: 'center',
  },
  todayBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 12,
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 'auto',
  },
  activeModeBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeModeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
  // Scroll Content
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiTile: {
    backgroundColor: colors.card,
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderTopWidth: 4,
    shadowColor: colors.textMuted,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiIconWrapper: {
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textDark,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  // Panel
  panel: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.textMuted,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  panelSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
  },
  panelBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  panelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  // Donut Chart
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  donutCenterLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValueText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textDark,
  },
  donutLabelText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  // Empty State
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  actionBtnCard: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDark,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  emptyStateSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  // Approvals
  approvalsList: {
    gap: 12,
  },
  approvalItem: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  approvalItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  approvalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  approvalItemInfo: {
    flex: 1,
  },
  approvalItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  approvalItemSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  approvalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: colors.dangerLight,
  },
  rejectBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  approveBtn: {
    backgroundColor: colors.successLight,
  },
  approveBtnText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  // Premium Cards for Table List
  tableList: {
    marginTop: 8,
    paddingHorizontal: 2, // Allow shadows to not be clipped
  },
  premiumCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#64748b',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  premiumCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumAvatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  premiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16, // squircle look
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 16,
  },
  premiumAvatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  premiumActiveIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  premiumUserInfo: {
    flex: 1,
  },
  premiumUserName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 4,
  },
  premiumUserStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  premiumLogBadge: {
    alignItems: 'flex-end',
  },
  logBadgeSuccess: { backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logBadgeSuccessText: { color: colors.success, fontSize: 10, fontWeight: '700' },
  logBadgeWarning: { backgroundColor: colors.warningLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logBadgeWarningText: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  logBadgeMuted: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logBadgeMutedText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  
  premiumStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  premiumStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  premiumStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e2e8f0',
  },
  premiumStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 4,
  },
  premiumStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textDark,
    fontVariant: ['tabular-nums'],
  },
  
  fabLogout: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuDrawer: {
    width: '75%',
    maxWidth: 300,
    height: '100%',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  menuDrawerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 20 : 60,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  drawerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  drawerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  drawerRole: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  menuDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#ffffff',
  },
  menuDrawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textDark,
  },
  closeMenuBtn: {
    padding: 8,
  },
  menuScroll: {
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  /* ── Brand Bar ── */
  brandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandLogo: { width: 135, height: 36 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hamburgerBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  /* ── Greeting ── */
  greetingSection: { gap: 4 },
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.4,
  },
  activeModePill: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeModePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  greetingSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  /* ── Date Control ── */
  dateControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 4,
  },
  dateControlLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  viewModeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    shadowColor: '#64748b',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  viewModeText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 3,
    shadowColor: '#64748b',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dateChevronBtn: { padding: 5 },
  dateCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  dateCenterText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  refreshIconBtn: {
    padding: 9,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    shadowColor: '#64748b',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  /* ── Sub Tab Bar ── */
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 2,
    gap: 14,
    marginBottom: 6,
  },
  subTabItem: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  subTabItemActive: {},
  subTabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  subTabTextActive: { color: '#db2777', fontWeight: '700' },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -2,
    left: 4,
    right: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#db2777',
  }
});

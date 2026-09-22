import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Vibration,
  TextInput,
  Image,
  Dimensions,
} from 'react-native';
import {
  Clock,
  Timer,
  Smartphone,
  Coffee,
  FileText,
  Calendar,
  QrCode,
  Wifi,
  Fingerprint,
  Camera,
  Menu,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  RefreshCw,
  LogOut,
  CheckCircle,
  AlertTriangle,
  X,
  Lock,
  LogIn,
  Check,
  Activity,
  Bell,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';
import { getDeviceSignals } from '../lib/device';
import { getStabilizedLocation } from '../lib/location';
import {
  calculateLiveWorkMetrics,
  calculateLiveWorkMs,
  formatDuration,
  formatTime,
  formatDate,
} from '../utils/workMetrics';
import MainWorkTimer, { MainWorkTimerKpi } from '../components/MainWorkTimer';
import BreakTimer from '../components/BreakTimer';
import DonutChart from '../components/DonutChart';
import BreakModal from '../components/BreakModal';
import DailyAttendanceReport from '../components/DailyAttendanceReport';
import CheckInModal from '../components/CheckInModal';
import CheckoutQrScanner from '../components/CheckoutQrScanner';
import AttendanceReportModal from '../components/AttendanceReportModal';
import DailyLogModal from '../components/DailyLogModal';
import { GeofenceProvider, useGeofence } from '../contexts/GeofenceContext';
import GeofenceAlertModal from '../components/GeofenceAlertModal';

export default function DashboardScreen({
  onNavigateHistory,
  onStartCheckIn,
  onStartCheckOut,
  onNavigateOvertime,
  onNavigateDailyLog,
  onNavigateLeave,
  onNavigateDevice,
  onNavigateManual,
  onNavigateProfile,
  onNavigateServices,
  onNavigateNotifications,
}) {
  const { user, logout, updateUserLocally } = useAuth();
  const { socket, isConnected } = useSocket();

  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals & Panels
  const [breakModalVisible, setBreakModalVisible] = useState(false);
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [checkInInitialMethod, setCheckInInitialMethod] = useState('qr_code');
  const [checkInAutoOpenScanner, setCheckInAutoOpenScanner] = useState(false);
  const [dailyLogModalVisible, setDailyLogModalVisible] = useState(false);
  const [checkoutScannerVisible, setCheckoutScannerVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // 1-second tick to synchronize live stopwatch computations
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboard = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else if (!dashboard) setLoading(true);

    try {
      const [dashRes, histRes] = await Promise.allSettled([
        api.get('/employee/dashboard'),
        api.get('/employee/attendance/me'),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.data?.success) {
        setDashboard(dashRes.value.data.data);
      }
      if (histRes.status === 'fulfilled' && histRes.value.data?.success) {
        setHistory(histRes.value.data.data?.attendance || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dashboard]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-time socket sync with backend
  useEffect(() => {
    if (!socket) return;

    const onAttendanceUpdate = () => fetchDashboard();
    const onCheckedOut = (data) => {
      setCheckoutScannerVisible(false);
      if (data?.summary || data?.attendance) {
        setReportData(data);
        setReportModalVisible(true);
      }
      fetchDashboard();
    };

    const onInitiateScan = () => {
      console.log('⚡ [Cross-Device] Received checkout:initiate_scan');
      Vibration.vibrate([0, 200, 100, 200]);
      setCheckoutScannerVisible(true);
      Alert.alert(
        '📷 PC Checkout Scan',
        'Camera scanner opened — please scan the checkout QR code on your PC monitor.'
      );
    };

    const onNotificationNew = (data) => {
      setUnreadCount((prev) => prev + 1);
      fetchDashboard();
      if (data?.title) {
        Alert.alert(data.title, data.message || '');
      }
    };
    const onLeaveResolved = (data) => {
      fetchDashboard();
      const statusText = data?.status === 'approved' ? 'Approved ✅' : 'Rejected ❌';
      Alert.alert('Leave Request Update', `Your leave request has been ${statusText}.`);
    };
    const onSettingUpdated = () => fetchDashboard();
    const onReactivated = () => {
      fetchDashboard();
      Alert.alert('Session Reactivated', 'Your attendance session has been resumed by management.');
    };

    // Manager rejects a session reactivation request
    const onReactivationRejected = (data) => {
      fetchDashboard();
      Alert.alert(
        '❌ Session Not Reactivated',
        data?.reason
          ? `Reactivation rejected: ${data.reason}`
          : 'Session reactivation was rejected by management. Attendance is closed for today.'
      );
    };

    // Server warns that workstation heartbeat signal was lost
    const onHeartbeatWarning = (data) => {
      Alert.alert(
        '⚠️ Heartbeat Warning',
        `Attendance heartbeat signal lost for ${data?.minutesMissing || 4} minutes. Keep the app active to avoid automatic session closure (${data?.timeoutMinutes || 8}m timeout).`
      );
    };

    // Manager approves/rejects an office-location override request
    const onLocationResolved = (data) => {
      fetchDashboard();
      const isApproved = data?.action === 'approve';
      Alert.alert(
        isApproved ? '📍 Location Approved' : '📍 Location Rejected',
        isApproved
          ? 'Your office location override request has been approved ✅.'
          : 'Your office location override request was rejected ❌.'
      );
    };

    socket.on('attendance:update', onAttendanceUpdate);
    socket.on('attendance:checked_out', onCheckedOut);
    socket.on('checkout:initiate_scan', onInitiateScan);
    socket.on('notification:new', onNotificationNew);
    socket.on('leave:request_resolved', onLeaveResolved);
    socket.on('attendance-setting:updated', onSettingUpdated);
    socket.on('office-location:updated', onSettingUpdated);
    socket.on('attendance:reactivated', onReactivated);
    socket.on('attendance:reactivation_rejected', onReactivationRejected);
    socket.on('attendance:heartbeat_warning', onHeartbeatWarning);
    socket.on('location:request_resolved', onLocationResolved);

    // Real-time profile & avatar sync across web ↔ mobile
    const onProfileUpdated = (data) => {
      if (data?.user) {
        updateUserLocally(data.user);
      }
    };
    socket.on('user:profile_updated', onProfileUpdated);

    return () => {
      socket.off('attendance:update', onAttendanceUpdate);
      socket.off('attendance:checked_out', onCheckedOut);
      socket.off('checkout:initiate_scan', onInitiateScan);
      socket.off('notification:new', onNotificationNew);
      socket.off('leave:request_resolved', onLeaveResolved);
      socket.off('attendance-setting:updated', onSettingUpdated);
      socket.off('office-location:updated', onSettingUpdated);
      socket.off('attendance:reactivated', onReactivated);
      socket.off('attendance:reactivation_rejected', onReactivationRejected);
      socket.off('attendance:heartbeat_warning', onHeartbeatWarning);
      socket.off('location:request_resolved', onLocationResolved);
      socket.off('user:profile_updated', onProfileUpdated);
    };
  }, [socket, fetchDashboard, updateUserLocally]);

  /**
   * Authoritative Check-Out Handler
   */
  const executeCheckout = async (extraPayload = {}) => {
    // 1. Daily work log compliance check
    if (!dashboard?.dailyLogSubmitted) {
      setDailyLogModalVisible(true);
      return;
    }

    setCheckoutLoading(true);
    try {
      const loc = await getStabilizedLocation();
      const device = await getDeviceSignals();

      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        timestamp: loc.timestamp,
        deviceFingerprint: device.deviceFingerprint,
        ...extraPayload,
      };

      const res = await api.post('/employee/attendance/check-out', payload);
      if (res.data?.success) {
        setCheckoutScannerVisible(false);
        setReportData(res.data.data);
        setReportModalVisible(true);
        fetchDashboard();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Check-out failed.';
      Alert.alert('Check-Out Failed', msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleOpenCheckIn = (method = 'qr_code', autoScanner = false) => {
    setCheckInInitialMethod(method);
    setCheckInAutoOpenScanner(autoScanner);
    if (onStartCheckIn) onStartCheckIn();
    setCheckInModalVisible(true);
  };

  // Derived attendance attributes
  const attWrapper = dashboard?.attendance;
  const todayAtt = attWrapper?.attendance || null;
  const isCheckedIn = Boolean(todayAtt?.checkInTime);
  const isCheckedOut = Boolean(todayAtt?.checkOutTime);
  const activeBreak = attWrapper?.activeBreak || null;
  const hasActiveBreak = Boolean(activeBreak);
  const breaksList = todayAtt?.breaks || attWrapper?.breaks || [];

  // Live completed break minutes
  const completedBreakMins = useMemo(() => {
    if (isCheckedIn && todayAtt?.checkInTime && !isCheckedOut) {
      const metrics = calculateLiveWorkMetrics(
        todayAtt.checkInTime,
        todayAtt.checkOutTime,
        breaksList,
        activeBreak
      );
      return metrics.totalBreakMinutes;
    }
    return (
      attWrapper?.completedBreakMinutes ??
      todayAtt?.completedBreakMinutes ??
      todayAtt?.totalBreakMinutes ??
      0
    );
  }, [isCheckedIn, isCheckedOut, todayAtt, attWrapper, breaksList, activeBreak, nowTick]);

  // Live work minutes
  const liveWorkMins = useMemo(() => {
    if (isCheckedIn && todayAtt?.checkInTime) {
      return Math.floor(
        calculateLiveWorkMs(
          todayAtt.checkInTime,
          todayAtt.checkOutTime,
          breaksList,
          activeBreak
        ) / 60000
      );
    }
    return todayAtt?.actualWorkMinutes || todayAtt?.totalWorkMinutes || 0;
  }, [isCheckedIn, todayAtt, breaksList, activeBreak, nowTick]);

  // Donut chart distribution data (8h target = 480m)
  const workBreakdownData = useMemo(() => {
    const work = liveWorkMins;
    const brk = completedBreakMins || 0;
    const target = 8 * 60;
    const remaining = Math.max(0, target - work - brk);

    return [
      {
        name: 'Productive Work',
        value: work,
        displayValue: `${Math.floor(work / 60)}h ${work % 60}m`,
        color: '#0284c7', // Sky Blue
      },
      {
        name: 'Completed Breaks',
        value: brk,
        displayValue: `${brk}m`,
        color: '#f59e0b', // Amber
      },
      {
        name: 'Remaining Shift',
        value: remaining,
        displayValue: `${Math.floor(remaining / 60)}h ${remaining % 60}m`,
        color: '#334155', // Slate
      },
    ];
  }, [liveWorkMins, completedBreakMins]);

  // Leave balances calculation
  const totalRemainingLeaves = useMemo(() => {
    if (!dashboard?.leaveBalances?.length) return 0;
    return dashboard.leaveBalances.reduce(
      (acc, b) => acc + Math.max(0, (b.allocated || 0) - (b.used || 0)),
      0
    );
  }, [dashboard?.leaveBalances]);

  const startTimeStr = todayAtt?.checkInTime
    ? formatTime(todayAtt.checkInTime)
    : '--:--';

  const breakTimeStr =
    completedBreakMins > 0 ? formatDuration(completedBreakMins) : '00:00';

  if (loading && !dashboard) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Employee Portal...</Text>
      </View>
    );
  }

  return (
    <GeofenceProvider
      isCheckedIn={isCheckedIn}
      isCheckedOut={isCheckedOut}
      hasActiveBreak={hasActiveBreak}
      heartbeatMonitoringEnabled={dashboard?.heartbeatMonitoringEnabled === true}
      initialOfficeRadius={dashboard?.officeRadius}
      onAttendanceClosed={() => fetchDashboard()}
    >
      <DashboardInner
        user={user}
        logout={logout}
        isConnected={isConnected}
        dashboard={dashboard}
        history={history}
        todayAtt={todayAtt}
        attWrapper={attWrapper}
        isCheckedIn={isCheckedIn}
        isCheckedOut={isCheckedOut}
        activeBreak={activeBreak}
        hasActiveBreak={hasActiveBreak}
        breaksList={breaksList}
        completedBreakMins={completedBreakMins}
        liveWorkMins={liveWorkMins}
        workBreakdownData={workBreakdownData}
        totalRemainingLeaves={totalRemainingLeaves}
        startTimeStr={startTimeStr}
        breakTimeStr={breakTimeStr}
        nowTick={nowTick}
        refreshing={refreshing}
        fetchDashboard={fetchDashboard}
        executeCheckout={executeCheckout}
        checkoutLoading={checkoutLoading}
        reportData={reportData}
        setReportData={setReportData}
        onNavigateHistory={onNavigateHistory}
        onStartCheckIn={onStartCheckIn}
        onStartCheckOut={onStartCheckOut}
        onNavigateOvertime={onNavigateOvertime}
        onNavigateDailyLog={onNavigateDailyLog}
        onNavigateLeave={onNavigateLeave}
        onNavigateDevice={onNavigateDevice}
        onNavigateManual={onNavigateManual}
        onNavigateProfile={onNavigateProfile}
        onNavigateServices={onNavigateServices}
        onNavigateNotifications={onNavigateNotifications}
        unreadCount={unreadCount}
        setUnreadCount={setUnreadCount}
        breakModalVisible={breakModalVisible}
        setBreakModalVisible={setBreakModalVisible}
        checkInModalVisible={checkInModalVisible}
        setCheckInModalVisible={setCheckInModalVisible}
        checkInInitialMethod={checkInInitialMethod}
        checkInAutoOpenScanner={checkInAutoOpenScanner}
        handleOpenCheckIn={handleOpenCheckIn}
        dailyLogModalVisible={dailyLogModalVisible}
        setDailyLogModalVisible={setDailyLogModalVisible}
        checkoutScannerVisible={checkoutScannerVisible}
        setCheckoutScannerVisible={setCheckoutScannerVisible}
        reportModalVisible={reportModalVisible}
        setReportModalVisible={setReportModalVisible}
        drawerVisible={drawerVisible}
        setDrawerVisible={setDrawerVisible}
      />
    </GeofenceProvider>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function DashboardInner(props) {
  const {
    user,
    logout,
    isConnected,
    dashboard,
    history,
    todayAtt,
    attWrapper,
    isCheckedIn,
    isCheckedOut,
    activeBreak,
    hasActiveBreak,
    breaksList,
    completedBreakMins,
    liveWorkMins,
    workBreakdownData,
    totalRemainingLeaves,
    startTimeStr,
    breakTimeStr,
    nowTick,
    refreshing,
    fetchDashboard,
    executeCheckout,
    checkoutLoading,
    reportData,
    setReportData,
    onNavigateHistory,
    onStartCheckIn,
    onStartCheckOut,
    onNavigateOvertime,
    onNavigateDailyLog,
    onNavigateLeave,
    onNavigateDevice,
    onNavigateManual,
    onNavigateProfile,
    onNavigateServices,
    onNavigateNotifications,
    unreadCount,
    setUnreadCount,
    breakModalVisible,
    setBreakModalVisible,
    checkInModalVisible,
    setCheckInModalVisible,
    checkInInitialMethod,
    checkInAutoOpenScanner,
    handleOpenCheckIn,
    dailyLogModalVisible,
    setDailyLogModalVisible,
    checkoutScannerVisible,
    setCheckoutScannerVisible,
    reportModalVisible,
    setReportModalVisible,
    drawerVisible,
    setDrawerVisible,
  } = props;

  const {
    alertLevel,
    geofenceStatus,
    distance,
    officeRadius,
  } = useGeofence();

  // Selected attendance modality tab in action panel (Office QR default)
  const defaultMethod = dashboard?.managerDefaultMethod || 'qr_code';
  const [selectedMethod, setSelectedMethod] = useState(defaultMethod);

  useEffect(() => {
    if (dashboard?.managerDefaultMethod) {
      setSelectedMethod(dashboard.managerDefaultMethod);
    }
  }, [dashboard?.managerDefaultMethod]);

  // Date view mode & navigation
  const [viewMode, setViewMode] = useState('Day');
  const [dayOffset, setDayOffset] = useState(0);
  const [presenceDismissed, setPresenceDismissed] = useState(false);

  useEffect(() => {
    if (isCheckedIn) {
      setPresenceDismissed(false);
    }
  }, [isCheckedIn]);

  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const isToday = dayOffset === 0;

  const displayDateText = useMemo(() => {
    if (viewMode === 'Week') {
      const start = new Date(selectedDate);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const sStr = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const eStr = end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${sStr} – ${eStr}`;
    }
    if (viewMode === 'Month') {
      return selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    return selectedDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [selectedDate, viewMode]);

  const selectedDayRecord = useMemo(() => {
    if (isToday) return todayAtt;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const targetKey = `${y}-${m}-${d}`;
    return (history || []).find(h => {
      if (!h.date) return false;
      const hStr = typeof h.date === 'string' ? h.date.split('T')[0] : '';
      return hStr === targetKey;
    }) || null;
  }, [isToday, todayAtt, selectedDate, history]);

  const weekSummary = useMemo(() => {
    const start = new Date(selectedDate);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const weekRecs = (history || []).filter(h => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return d >= start && d <= end;
    });

    const totalWorkMins = weekRecs.reduce((acc, r) => acc + (r.actualWorkMinutes || 0), 0);
    const totalBreakMins = weekRecs.reduce((acc, r) => acc + (r.totalBreakMinutes || 0), 0);
    const daysPresent = weekRecs.filter(r => r.status === 'present').length;
    const halfDays = weekRecs.filter(r => r.status === 'half_day').length;

    const daysList = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      const rec = weekRecs.find(r => (typeof r.date === 'string' ? r.date.split('T')[0] : '') === key);
      daysList.push({
        date: cur,
        dateStr: cur.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        dayName: cur.toLocaleDateString('en-IN', { weekday: 'short' }),
        record: rec || null,
        hours: rec?.actualWorkMinutes ? Math.round((rec.actualWorkMinutes / 60) * 10) / 10 : 0,
        status: rec?.status || (cur > new Date() ? 'upcoming' : 'absent'),
      });
    }

    return {
      daysList,
      totalHours: Math.round((totalWorkMins / 60) * 10) / 10,
      totalBreakHours: Math.round((totalBreakMins / 60) * 10) / 10,
      daysPresent,
      halfDays,
      avgHours: daysPresent > 0 ? Math.round((totalWorkMins / 60 / daysPresent) * 10) / 10 : 0,
      startDateStr: start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      endDateStr: end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  }, [selectedDate, history]);

  const monthSummary = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const monthRecs = (history || []).filter(h => {
      if (!h.date) return false;
      const d = new Date(h.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });

    const totalWorkMins = monthRecs.reduce((acc, r) => acc + (r.actualWorkMinutes || 0), 0);
    const totalBreakMins = monthRecs.reduce((acc, r) => acc + (r.totalBreakMinutes || 0), 0);
    const daysPresent = monthRecs.filter(r => r.status === 'present').length;
    const halfDays = monthRecs.filter(r => r.status === 'half_day').length;

    return {
      monthRecs,
      totalHours: Math.round((totalWorkMins / 60) * 10) / 10,
      totalBreakHours: Math.round((totalBreakMins / 60) * 10) / 10,
      daysPresent,
      halfDays,
      avgHours: daysPresent > 0 ? Math.round((totalWorkMins / 60 / daysPresent) * 10) / 10 : 0,
      monthName: selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    };
  }, [selectedDate, history]);

  const pastWorkBreakdownData = useMemo(() => {
    const work = selectedDayRecord?.actualWorkMinutes || 0;
    const brk = selectedDayRecord?.totalBreakMinutes || 0;
    const target = 8 * 60;
    const remaining = Math.max(0, target - work - brk);

    return [
      {
        name: 'Productive Work',
        value: work,
        displayValue: `${Math.floor(work / 60)}h ${work % 60}m`,
        color: '#0284c7',
      },
      {
        name: 'Completed Breaks',
        value: brk,
        displayValue: `${brk}m`,
        color: '#f59e0b',
      },
      {
        name: 'Remaining Shift',
        value: remaining,
        displayValue: `${Math.floor(remaining / 60)}h ${remaining % 60}m`,
        color: '#334155',
      },
    ];
  }, [selectedDayRecord]);

  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonInput, setReasonInput] = useState('');
  const [submittingReason, setSubmittingReason] = useState(false);

  // Polling fallback while reactivation is pending review
  useEffect(() => {
    const isPending = todayAtt?.reactivationStatus === 'pending';
    if (!isPending) return;
    const pollInterval = setInterval(() => {
      fetchDashboard(true);
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [todayAtt?.reactivationStatus, fetchDashboard]);

  // Past 18:00 IST calculation
  const isPastShiftEnd = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    return h > 18 || (h === 18 && m > 0);
  }, [nowTick]);

  // Past 20:00 IST break lockout
  const isPastBreakLockout = useMemo(() => {
    return new Date().getHours() >= 20;
  }, [nowTick]);

  const handleSubmitReactivationReason = async () => {
    if (!reasonInput.trim()) {
      Alert.alert('Reason Required', 'Please enter an explanation for management.');
      return;
    }
    setSubmittingReason(true);
    try {
      await api.post('/employee/presence/reason', { reason: reasonInput.trim() });
      Alert.alert('Reason Submitted', 'Your explanation has been submitted for manager review.');
      setReasonModalVisible(false);
      setReasonInput('');
      fetchDashboard(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to submit reason.');
    } finally {
      setSubmittingReason(false);
    }
  };

  // ── Access Denied Gate for Unregistered Device ──
  if (dashboard?.deviceStatus?.statusType === 'registered_other_device') {
    return (
      <View style={styles.accessDeniedContainer}>
        <View style={styles.accessDeniedIconBadge}>
          <Text style={{ fontSize: 44 }}>🛡️</Text>
        </View>
        <Text style={styles.accessDeniedTitle}>Access Denied</Text>
        <Text style={styles.accessDeniedDesc}>
          This mobile device is not registered for this account. Please login with your registered device or request replacement.
        </Text>
        <TouchableOpacity
          style={styles.accessDeniedPrimaryBtn}
          onPress={() => onNavigateDevice && onNavigateDevice()}
        >
          <Text style={styles.accessDeniedPrimaryBtnText}>Request Device Replacement</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.accessDeniedGhostBtn} onPress={logout}>
          <Text style={styles.accessDeniedGhostBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active Mode label for greeting badge
  const activeModeName = (
    dashboard?.managerDefaultMethod ||
    todayAtt?.checkInMethod ||
    'QR CODE'
  ).toUpperCase().replace('_', ' ');

  // Last seen formatted text
  const lastSeenStr = todayAtt?.checkInTime
    ? formatTime(todayAtt.checkInTime)
    : '--:--';

  const isLogSubmitted = Boolean(dashboard?.dailyLogSubmitted);

  return (
    <View style={styles.screen}>
      {/* ── 1. Top Brand Header Bar ── */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.brandRight}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={() => setDrawerVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel="Open Navigation Drawer"
          >
            <Menu size={24} color="#334155" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDashboard(true)}
            colors={['#6366f1']}
          />
        }
      >
        {/* ── 2. Greeting Header & Active Mode Badge ── */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>
            Good {getGreeting()}, {user?.name?.split(' ')[0] || 'Employee'} 👋
          </Text>
          <View style={styles.activeModePill}>
            <Text style={styles.activeModePillText}>
              Active Mode: {activeModeName}
            </Text>
          </View>
          <Text style={styles.greetingSubtitle}>
            Daily presence tracking, shift timers, and compliance verification · {dashboard?.teamName || 'Technical'}
          </Text>
        </View>

        {/* ── 3. Date Control Strip ── */}
        <View style={styles.dateControlRow}>
          <View style={styles.dateControlLeft}>
            <TouchableOpacity
              style={styles.viewModeDropdown}
              onPress={() => {
                const modes = ['Day', 'Week', 'Month'];
                const next = modes[(modes.indexOf(viewMode) + 1) % modes.length];
                setViewMode(next);
              }}
            >
              <Text style={styles.viewModeText}>{viewMode}</Text>
              <ChevronDown size={14} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.dateNavigator}>
              <TouchableOpacity
                onPress={() => {
                  const step = viewMode === 'Week' ? 7 : viewMode === 'Month' ? 30 : 1;
                  setDayOffset((prev) => prev - step);
                }}
                style={styles.dateChevronBtn}
              >
                <ChevronLeft size={16} color="#64748b" />
              </TouchableOpacity>
              <View style={styles.dateCenter}>
                <Calendar size={13} color="#7c3aed" />
                <Text style={styles.dateCenterText}>{displayDateText}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const step = viewMode === 'Week' ? 7 : viewMode === 'Month' ? 30 : 1;
                  setDayOffset((prev) => prev + step);
                }}
                style={styles.dateChevronBtn}
              >
                <ChevronRight size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.refreshIconBtn}
            onPress={() => fetchDashboard(true)}
          >
            <RefreshCw size={15} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* ── 4. Secondary Horizontal Tab Strip ── */}
        <View style={styles.subTabBar}>
          <TouchableOpacity style={[styles.subTabItem, styles.subTabItemActive]}>
            <Text style={[styles.subTabText, styles.subTabTextActive]}>Overview</Text>
            <View style={styles.activeTabIndicator} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.subTabItem}
            onPress={() => onNavigateHistory && onNavigateHistory()}
          >
            <Text style={styles.subTabText}>Attendance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.subTabItem}
            onPress={() => {
              if (onNavigateDailyLog) onNavigateDailyLog();
              else setDailyLogModalVisible(true);
            }}
          >
            <Text style={styles.subTabText}>Daily Work Log</Text>
            <View
              style={[
                styles.tabMandatoryChip,
                isLogSubmitted && { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
              ]}
            >
              <Text
                style={[
                  styles.tabMandatoryChipText,
                  isLogSubmitted && { color: '#15803d' },
                ]}
              >
                {isLogSubmitted ? 'Submitted' : 'Mandatory'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Heartbeat Monitoring Status Banner matching Web ── */}
        <View
          style={[
            styles.heartbeatBanner,
            dashboard?.heartbeatMonitoringEnabled
              ? styles.heartbeatBannerOn
              : styles.heartbeatBannerOff,
          ]}
        >
          <View style={styles.heartbeatBannerLeft}>
            <Activity
              size={14}
              color={dashboard?.heartbeatMonitoringEnabled ? '#b45309' : '#64748b'}
            />
            <Text
              style={[
                styles.heartbeatBannerText,
                dashboard?.heartbeatMonitoringEnabled
                  ? styles.heartbeatTextOn
                  : styles.heartbeatTextOff,
              ]}
              numberOfLines={2}
            >
              {dashboard?.heartbeatMonitoringEnabled
                ? '⚡ Heartbeat monitoring is ON — keep phone active during work'
                : '⚡ Heartbeat monitoring is OFF — phone lock will not close your session'}
            </Text>
          </View>
          <View
            style={[
              styles.heartbeatPill,
              dashboard?.heartbeatMonitoringEnabled
                ? styles.heartbeatPillOn
                : styles.heartbeatPillOff,
            ]}
          >
            <Text
              style={[
                styles.heartbeatPillText,
                dashboard?.heartbeatMonitoringEnabled
                  ? styles.heartbeatPillTextOn
                  : styles.heartbeatPillTextOff,
              ]}
            >
              {dashboard?.heartbeatMonitoringEnabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>

        {/* ── Date Notice Banner (When Viewing Past Day or Week/Month) ── */}
        {(!isToday || viewMode !== 'Day') && (
          <View style={styles.dateNoticeBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateNoticeTitle}>
                {viewMode === 'Week'
                  ? `Weekly Summary (${weekSummary.startDateStr} – ${weekSummary.endDateStr})`
                  : viewMode === 'Month'
                  ? `Monthly Summary (${monthSummary.monthName})`
                  : `Viewing Past Date: ${displayDateText}`}
              </Text>
              <Text style={styles.dateNoticeSub}>
                {viewMode === 'Week'
                  ? `${weekSummary.daysPresent} days present · ${weekSummary.totalHours} hrs worked`
                  : viewMode === 'Month'
                  ? `${monthSummary.daysPresent} days present · ${monthSummary.totalHours} hrs worked`
                  : selectedDayRecord
                  ? `Status: ${(selectedDayRecord.status || 'present').toUpperCase()} · ${formatDuration(selectedDayRecord.actualWorkMinutes || 0)} worked`
                  : 'No attendance punch recorded on this date'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.jumpTodayBtn}
              onPress={() => {
                setDayOffset(0);
                setViewMode('Day');
              }}
            >
              <Text style={styles.jumpTodayBtnText}>Jump to Today</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Auto-Checkout & Session Reactivation Banner ── */}
        {todayAtt?.autoCheckedOut && (
          <View style={styles.autoCheckoutBannerContainer}>
            {todayAtt.reactivationStatus === 'pending' ? (
              <View style={styles.reactivationPendingCard}>
                <View style={styles.reactivationIconCol}>
                  <ActivityIndicator size="small" color="#d97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.reactivationBadgeRow}>
                    <Text style={styles.reactivationTitle}>Session Reactivation Under Review</Text>
                    <View style={styles.pendingReviewPill}>
                      <Text style={styles.pendingReviewPillText}>Pending Approval</Text>
                    </View>
                  </View>
                  <Text style={styles.reactivationReasonText}>
                    Reason: <Text style={{ fontStyle: 'italic' }}>"{todayAtt.outOfBoundsReason}"</Text> · Session resumes upon approval.
                  </Text>
                </View>
                <TouchableOpacity style={styles.refreshReactivationBtn} onPress={() => fetchDashboard(true)}>
                  <RefreshCw size={14} color="#b45309" />
                </TouchableOpacity>
              </View>
            ) : todayAtt.reactivationStatus === 'rejected' ? (
              <View style={styles.reactivationRejectedCard}>
                <AlertTriangle size={24} color="#e11d48" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reactivationRejectedTitle}>Attendance Session Closed for Today</Text>
                  <Text style={styles.reactivationRejectedSub}>
                    Management note: {todayAtt.reactivationDecisionNotes || 'Request was rejected. Session is permanently closed for today.'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.sessionSuspendedCard}>
                <AlertTriangle size={24} color="#e11d48" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionSuspendedTitle}>Session Suspended</Text>
                  <Text style={styles.sessionSuspendedSub}>
                    Automatic check-out triggered due to perimeter departure.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.explainReasonBtn}
                  onPress={() => setReasonModalVisible(true)}
                >
                  <Text style={styles.explainReasonBtnText}>Submit Reason</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Presence Verified / In Perimeter Radar Banner (Dismissible + 8s Auto-hide) ── */}
        {isCheckedIn && !isCheckedOut && !todayAtt?.autoCheckedOut && alertLevel === 0 && !presenceDismissed && (
          <View style={styles.presenceVerifiedCard}>
            <View style={styles.presenceCheckCircle}>
              <Check size={18} color="#ffffff" strokeWidth={3} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.presenceHeaderRow}>
                <Text style={styles.presenceTitle}>
                  {geofenceStatus === 'RETURNING' ? 'Back in Office Premises' : 'Presence Verified'}
                </Text>
                <View style={styles.inPerimeterPill}>
                  <View style={styles.greenPulseDot} />
                  <Text style={styles.inPerimeterText}>In Perimeter</Text>
                </View>
              </View>
              <Text style={styles.presenceSub}>
                {geofenceStatus === 'RETURNING'
                  ? 'You are safely back within the office boundary. Warning alerts have stopped.'
                  : 'You are safely within the authorized office boundary.'}
              </Text>
              <View style={styles.distanceRow}>
                <Text style={styles.distanceText}>
                  {distance !== null ? `${distance}m` : 'Inside'} / {officeRadius || dashboard?.officeRadius || 100}m allowed
                </Text>
                <Text style={styles.secureBadgeText}>SECURE • VERIFIED • ON PREMISES</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closePresenceBtn}
              onPress={() => setPresenceDismissed(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Dismiss message"
            >
              <X size={16} color="#15803d" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── 5. The 6-Tile Pastel KPI Grid (2 Columns) ── */}
        <View style={styles.kpiGrid}>
          {/* Card 1: Start Time / Total Work Hours */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#ecfdf5' }]}>
                <Clock size={18} color="#059669" strokeWidth={2.2} />
              </View>
              <View style={[styles.kpiChip, { backgroundColor: '#dcfce7' }]}>
                <Text style={[styles.kpiChipText, { color: '#15803d' }]}>
                  {viewMode === 'Week' ? 'Weekly Total' : viewMode === 'Month' ? 'Monthly Total' : isToday ? 'First Punch' : 'Punch In'}
                </Text>
              </View>
            </View>
            <Text style={styles.kpiValueText}>
              {viewMode === 'Week'
                ? `${weekSummary.totalHours}h`
                : viewMode === 'Month'
                ? `${monthSummary.totalHours}h`
                : isToday
                ? startTimeStr
                : selectedDayRecord?.checkInTime
                ? formatTime(selectedDayRecord.checkInTime)
                : '--:--'}
            </Text>
            <Text style={styles.kpiLabel}>
              {viewMode === 'Day' ? 'Start Time' : 'Total Work'}
            </Text>
          </View>

          {/* Card 2: Working Time / Days Present */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#ecfeff' }]}>
                <Timer size={18} color="#0284c7" strokeWidth={2.2} />
              </View>
              <View
                style={[
                  styles.kpiChip,
                  (viewMode !== 'Day' || isCheckedIn) ? { backgroundColor: '#e0f2fe' } : { backgroundColor: '#f1f5f9' },
                ]}
              >
                <Text
                  style={[
                    styles.kpiChipText,
                    (viewMode !== 'Day' || isCheckedIn) ? { color: '#0369a1' } : { color: '#64748b' },
                  ]}
                >
                  {viewMode === 'Week'
                    ? '7-Day Span'
                    : viewMode === 'Month'
                    ? 'Month Span'
                    : isToday
                    ? isCheckedIn
                      ? 'Net Focus Time'
                      : 'Offline'
                    : 'Shift Duration'}
                </Text>
              </View>
            </View>
            {viewMode === 'Day' && isToday ? (
              <MainWorkTimerKpi
                checkInTime={todayAtt?.checkInTime}
                checkOutTime={todayAtt?.checkOutTime}
                breaks={breaksList}
                activeBreak={activeBreak}
              />
            ) : (
              <Text style={styles.kpiValueText}>
                {viewMode === 'Week'
                  ? `${weekSummary.daysPresent} Days`
                  : viewMode === 'Month'
                  ? `${monthSummary.daysPresent} Days`
                  : formatDuration(selectedDayRecord?.actualWorkMinutes || 0)}
              </Text>
            )}
            <Text style={styles.kpiLabel}>
              {viewMode === 'Day' ? 'Working Time' : 'Days Present'}
            </Text>
          </View>

          {/* Card 3: Last Seen / Punch Out / Daily Avg */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#faf5ff' }]}>
                <Smartphone size={18} color="#7c3aed" strokeWidth={2.2} />
              </View>
              <View style={[styles.kpiChip, { backgroundColor: '#f3e8ff' }]}>
                <Text style={[styles.kpiChipText, { color: '#6b21a8' }]}>
                  {viewMode === 'Week'
                    ? 'Avg/Day'
                    : viewMode === 'Month'
                    ? 'Avg/Day'
                    : isToday
                    ? todayAtt?.checkInMethod?.replace('_', ' ').toUpperCase() || 'ENFORCED'
                    : selectedDayRecord?.checkInMethod?.replace('_', ' ').toUpperCase() || 'RECORDED'}
                </Text>
              </View>
            </View>
            <Text style={styles.kpiValueText}>
              {viewMode === 'Week'
                ? `${weekSummary.avgHours}h`
                : viewMode === 'Month'
                ? `${monthSummary.avgHours}h`
                : isToday
                ? lastSeenStr
                : selectedDayRecord?.checkOutTime
                ? formatTime(selectedDayRecord.checkOutTime)
                : '--:--'}
            </Text>
            <Text style={styles.kpiLabel}>
              {viewMode === 'Day' ? (isToday ? 'Last Seen' : 'Check Out') : 'Daily Average'}
            </Text>
          </View>

          {/* Card 4: Break Time / Total Break Hours */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#fffbeb' }]}>
                <Coffee size={18} color="#d97706" strokeWidth={2.2} />
              </View>
              <View style={[styles.kpiChip, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.kpiChipText, { color: '#b45309' }]}>
                  {viewMode !== 'Day' ? 'Total Break' : 'Deductions'}
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: '#d97706' }]}>
              {viewMode === 'Week'
                ? `${weekSummary.totalBreakHours}h`
                : viewMode === 'Month'
                ? `${monthSummary.totalBreakHours}h`
                : isToday
                ? breakTimeStr
                : formatDuration(selectedDayRecord?.totalBreakMinutes || 0)}
            </Text>
            <Text style={styles.kpiLabel}>Break Time</Text>
          </View>

          {/* Card 5: Daily Work Log / Half Days */}
          <TouchableOpacity
            style={styles.kpiCard}
            activeOpacity={0.7}
            onPress={() => {
              if (viewMode === 'Day' && isToday) {
                if (onNavigateDailyLog) onNavigateDailyLog();
                else setDailyLogModalVisible(true);
              }
            }}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#fff7ed' }]}>
                <FileText size={18} color="#ea580c" strokeWidth={2.2} />
              </View>
              <View style={[styles.kpiChip, { backgroundColor: '#ffedd5' }]}>
                <Text style={[styles.kpiChipText, { color: '#c2410c' }]}>
                  {viewMode === 'Day' ? 'Compliance' : 'Half Shifts'}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.kpiValueText,
                {
                  color:
                    viewMode !== 'Day'
                      ? '#ea580c'
                      : isToday
                      ? isLogSubmitted
                        ? '#16a34a'
                        : '#ea580c'
                      : selectedDayRecord?.dailyLogSubmitted
                      ? '#16a34a'
                      : '#64748b',
                },
              ]}
            >
              {viewMode === 'Week'
                ? `${weekSummary.halfDays} Days`
                : viewMode === 'Month'
                ? `${monthSummary.halfDays} Days`
                : isToday
                ? isLogSubmitted
                  ? 'Submitted'
                  : 'Mandatory'
                : selectedDayRecord?.dailyLogSubmitted
                ? 'Submitted'
                : 'Not Filed'}
            </Text>
            <Text style={styles.kpiLabel}>
              {viewMode === 'Day' ? 'Daily Work Log' : 'Half Days'}
            </Text>
          </TouchableOpacity>

          {/* Card 6: Leave Balance */}
          <TouchableOpacity
            style={styles.kpiCard}
            activeOpacity={0.7}
            onPress={() => onNavigateLeave && onNavigateLeave()}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconCircle, { backgroundColor: '#eff6ff' }]}>
                <Calendar size={18} color="#2563eb" strokeWidth={2.2} />
              </View>
              <View style={[styles.kpiChip, { backgroundColor: '#dbeafe' }]}>
                <Text style={[styles.kpiChipText, { color: '#1d4ed8' }]}>Available</Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: '#2563eb' }]}>
              {totalRemainingLeaves} Days
            </Text>
            <Text style={styles.kpiLabel}>Leave Balance</Text>
          </TouchableOpacity>
        </View>

        {/* ── Conditional Action Panels for Week / Month / Past Day vs Live Today ── */}
        {viewMode === 'Week' ? (
          <View style={styles.panelCard}>
            <View style={styles.panelHeaderRow}>
              <View>
                <Text style={styles.panelTitle}>Weekly Attendance Breakdown</Text>
                <Text style={styles.panelSubtitle}>
                  {weekSummary.startDateStr} – {weekSummary.endDateStr} · {weekSummary.daysPresent} days present
                </Text>
              </View>
              <TouchableOpacity
                style={styles.jumpTodayBtnSmall}
                onPress={() => {
                  setDayOffset(0);
                  setViewMode('Day');
                }}
              >
                <Text style={styles.jumpTodayBtnSmallText}>Today</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekDaysGrid}>
              {weekSummary.daysList.map((dayItem, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.weekDayCard,
                    dayItem.record && styles.weekDayCardActive,
                  ]}
                  onPress={() => {
                    const diffDays = Math.round((new Date(dayItem.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                    setViewMode('Day');
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.weekDayCardHeader}>
                    <Text style={styles.weekDayName}>{dayItem.dayName}</Text>
                    <Text style={styles.weekDayDate}>{dayItem.dateStr}</Text>
                  </View>
                  <View style={styles.weekDayBody}>
                    <Text style={styles.weekDayHours}>
                      {dayItem.hours > 0 ? `${dayItem.hours}h` : '0h'}
                    </Text>
                    <View
                      style={[
                        styles.weekDayStatusBadge,
                        dayItem.status === 'present'
                          ? { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }
                          : dayItem.status === 'half_day'
                          ? { backgroundColor: '#fef3c7', borderColor: '#fde68a' }
                          : dayItem.status === 'upcoming'
                          ? { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }
                          : { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekDayStatusText,
                          dayItem.status === 'present'
                            ? { color: '#15803d' }
                            : dayItem.status === 'half_day'
                            ? { color: '#b45309' }
                            : dayItem.status === 'upcoming'
                            ? { color: '#64748b' }
                            : { color: '#b91c1c' },
                        ]}
                      >
                        {dayItem.status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : viewMode === 'Month' ? (
          <View style={styles.panelCard}>
            <View style={styles.panelHeaderRow}>
              <View>
                <Text style={styles.panelTitle}>Monthly Summary · {monthSummary.monthName}</Text>
                <Text style={styles.panelSubtitle}>
                  {monthSummary.daysPresent} present · {monthSummary.totalHours}h worked · {monthSummary.avgHours}h/day avg
                </Text>
              </View>
              <TouchableOpacity
                style={styles.jumpTodayBtnSmall}
                onPress={() => {
                  setDayOffset(0);
                  setViewMode('Day');
                }}
              >
                <Text style={styles.jumpTodayBtnSmallText}>Today</Text>
              </TouchableOpacity>
            </View>

            {monthSummary.monthRecs.length === 0 ? (
              <View style={styles.emptyMonthBox}>
                <Calendar size={36} color="#94a3b8" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyMonthTitle}>No Attendance in {monthSummary.monthName}</Text>
                <Text style={styles.emptyMonthSub}>No punch records logged for this calendar month.</Text>
              </View>
            ) : (
              <View style={styles.monthRecsList}>
                {monthSummary.monthRecs.map((rec, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.monthRecItem}
                    onPress={() => {
                      if (rec.date) {
                        const recD = new Date(rec.date);
                        const diffDays = Math.round((recD.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
                        setDayOffset(diffDays);
                        setViewMode('Day');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.monthRecLeft}>
                      <Text style={styles.monthRecDate}>
                        {new Date(rec.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                      </Text>
                      <Text style={styles.monthRecTimes}>
                        {rec.checkInTime ? formatTime(rec.checkInTime) : '--:--'} – {rec.checkOutTime ? formatTime(rec.checkOutTime) : '--:--'}
                      </Text>
                    </View>
                    <View style={styles.monthRecRight}>
                      <Text style={styles.monthRecHours}>{formatDuration(rec.actualWorkMinutes || 0)}</Text>
                      <View
                        style={[
                          styles.weekDayStatusBadge,
                          rec.status === 'present'
                            ? { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }
                            : { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekDayStatusText,
                            rec.status === 'present' ? { color: '#15803d' } : { color: '#b45309' },
                          ]}
                        >
                          {(rec.status || 'present').replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : !isToday ? (
          <View style={styles.panelCard}>
            <View style={styles.panelHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>Past Attendance Record</Text>
                <Text style={styles.panelSubtitle}>{displayDateText}</Text>
              </View>
              <TouchableOpacity
                style={styles.jumpTodayBtnSmall}
                onPress={() => {
                  setDayOffset(0);
                  setViewMode('Day');
                }}
              >
                <Text style={styles.jumpTodayBtnSmallText}>Return to Today</Text>
              </TouchableOpacity>
            </View>

            {selectedDayRecord ? (
              <View style={styles.pastRecordCard}>
                <View style={styles.pastRecordStatusRow}>
                  <View style={styles.pastRecordBadge}>
                    <Text style={styles.pastRecordBadgeText}>
                      {(selectedDayRecord.status || 'present').replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.pastRecordMethod}>
                    Method: {(selectedDayRecord.checkInMethod || 'QR').replace('_', ' ').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.pastRecordDetailsGrid}>
                  <View style={styles.pastDetailCol}>
                    <Text style={styles.pastDetailLabel}>Punch In</Text>
                    <Text style={styles.pastDetailValue}>
                      {selectedDayRecord.checkInTime ? formatTime(selectedDayRecord.checkInTime) : '--:--'}
                    </Text>
                  </View>
                  <View style={styles.pastDetailCol}>
                    <Text style={styles.pastDetailLabel}>Punch Out</Text>
                    <Text style={styles.pastDetailValue}>
                      {selectedDayRecord.checkOutTime ? formatTime(selectedDayRecord.checkOutTime) : '--:--'}
                    </Text>
                  </View>
                  <View style={styles.pastDetailCol}>
                    <Text style={styles.pastDetailLabel}>Work Hours</Text>
                    <Text style={[styles.pastDetailValue, { color: '#0284c7' }]}>
                      {formatDuration(selectedDayRecord.actualWorkMinutes || 0)}
                    </Text>
                  </View>
                  <View style={styles.pastDetailCol}>
                    <Text style={styles.pastDetailLabel}>Breaks</Text>
                    <Text style={[styles.pastDetailValue, { color: '#d97706' }]}>
                      {formatDuration(selectedDayRecord.totalBreakMinutes || 0)}
                    </Text>
                  </View>
                </View>

                <View style={styles.pastRecordFooter}>
                  <Text style={styles.pastRecordFooterText}>
                    Daily Log: {selectedDayRecord.dailyLogSubmitted ? '✅ Log Sheet Submitted' : '⚠️ No Log Sheet on Record'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyPastBox}>
                <Calendar size={36} color="#94a3b8" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyPastTitle}>No Attendance Recorded</Text>
                <Text style={styles.emptyPastSub}>
                  {selectedDate > new Date()
                    ? 'This is a future date.'
                    : 'No attendance punch was recorded on this date (Absent or Weekend).'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* ── 6. Attendance Device Status Card ── */}
            <View style={styles.deviceCard}>
          <View style={styles.deviceHeaderRow}>
            <View style={styles.deviceHeaderLeft}>
              <View style={styles.deviceIconSquircle}>
                <Smartphone size={20} color="#16a34a" strokeWidth={2.2} />
              </View>
              <View>
                <Text style={styles.deviceCardTitle}>Attendance Device</Text>
                <Text style={styles.deviceCardSubtitle}>Hardware security & binding</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.deviceViewBtn}
              onPress={() => onNavigateDevice && onNavigateDevice()}
            >
              <Text style={styles.deviceViewBtnText}>View &gt;</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.deviceCardBody}>
            <View style={styles.deviceStatusRow}>
              <View style={styles.deviceStatusDot} />
              <Text style={styles.deviceStatusLabel}>
                {dashboard?.deviceStatus?.statusType === 'temporary'
                  ? 'Temporary Device'
                  : dashboard?.deviceStatus?.statusType === 'pending'
                  ? 'Pending Approval'
                  : 'Active Device'}
              </Text>
            </View>
            <Text style={styles.deviceModelText}>
              {dashboard?.deviceStatus?.device?.deviceLabel ||
                (dashboard?.deviceStatus?.device?.brand
                  ? `${dashboard.deviceStatus.device.brand} · ${dashboard.deviceStatus.device.osName || 'Android'}`
                  : 'Registered Mobile Device')}
            </Text>
            <Text style={styles.deviceDescText}>
              {dashboard?.deviceStatus?.statusType === 'pending'
                ? 'Device registration request is awaiting manager approval.'
                : 'This device is registered and authorized for attendance.'}
            </Text>
          </View>
        </View>

        {/* ── 7. Attendance Method Action Panel ── */}
        <View style={styles.methodCard}>
          {/* Header */}
          <View style={styles.methodHeaderRow}>
            <View style={styles.methodHeaderLeft}>
              <Text style={styles.methodHeaderTitle}>Attendance Method:</Text>
              <Text style={styles.methodHeaderMethodCode}>
                {(isCheckedIn ? (todayAtt?.checkInMethod || 'QR_CODE') : selectedMethod).toUpperCase().replace('_', ' ')}
              </Text>
            </View>
            <View
              style={[
                styles.methodStatusBadge,
                isCheckedIn && { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
              ]}
            >
              <Text
                style={[
                  styles.methodStatusBadgeText,
                  isCheckedIn && { color: '#059669' },
                ]}
              >
                {isCheckedIn ? '🟢 Session Active' : 'Ready to Punch'}
              </Text>
            </View>
          </View>

          {/* If Not Checked In: Method Selector & Action Trigger */}
          {!isCheckedIn ? (
            <View style={styles.methodUncheckedContainer}>
              {/* Method Switcher Tabs */}
              <View style={styles.methodSwitcherStrip}>
                {/* 1. Biometric */}
                <TouchableOpacity
                  style={[
                    styles.methodTabItem,
                    selectedMethod === 'biometric' && styles.methodTabItemActive,
                  ]}
                  onPress={() => setSelectedMethod('biometric')}
                  activeOpacity={0.8}
                >
                  <Fingerprint
                    size={16}
                    color={selectedMethod === 'biometric' ? '#7c3aed' : '#64748b'}
                    strokeWidth={1.8}
                  />
                  <Text
                    style={[
                      styles.methodTabItemText,
                      selectedMethod === 'biometric' && styles.methodTabItemTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    Biometric
                  </Text>
                  {dashboard?.managerDefaultMethod === 'biometric' && (
                    <View style={styles.tabDefaultPill}>
                      <Text style={styles.tabDefaultPillText}>Default</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* 2. Office WiFi */}
                <TouchableOpacity
                  style={[
                    styles.methodTabItem,
                    selectedMethod === 'wifi_ip' && styles.methodTabItemActive,
                  ]}
                  onPress={() => setSelectedMethod('wifi_ip')}
                  activeOpacity={0.8}
                >
                  <Wifi
                    size={15}
                    color={selectedMethod === 'wifi_ip' ? '#059669' : '#64748b'}
                    strokeWidth={1.8}
                  />
                  <View style={styles.stackedTextCol}>
                    <Text
                      style={[
                        styles.stackedTextLine,
                        selectedMethod === 'wifi_ip' && styles.stackedTextLineActive,
                      ]}
                    >
                      Office
                    </Text>
                    <Text
                      style={[
                        styles.stackedTextLine,
                        selectedMethod === 'wifi_ip' && styles.stackedTextLineActive,
                      ]}
                    >
                      WiFi
                    </Text>
                  </View>
                  {dashboard?.managerDefaultMethod === 'wifi_ip' && (
                    <View style={[styles.tabDefaultPill, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                      <Text style={[styles.tabDefaultPillText, { color: '#059669' }]}>Default</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* 3. Office QR */}
                <TouchableOpacity
                  style={[
                    styles.methodTabItem,
                    selectedMethod === 'qr_code' && styles.methodTabItemActive,
                  ]}
                  onPress={() => setSelectedMethod('qr_code')}
                  activeOpacity={0.8}
                >
                  <QrCode
                    size={15}
                    color={selectedMethod === 'qr_code' ? '#0284c7' : '#64748b'}
                    strokeWidth={1.8}
                  />
                  <View style={styles.stackedTextCol}>
                    <Text
                      style={[
                        styles.stackedTextLine,
                        selectedMethod === 'qr_code' && styles.stackedTextLineActive,
                      ]}
                    >
                      Office
                    </Text>
                    <Text
                      style={[
                        styles.stackedTextLine,
                        selectedMethod === 'qr_code' && styles.stackedTextLineActive,
                      ]}
                    >
                      QR
                    </Text>
                  </View>
                  {(dashboard?.managerDefaultMethod === 'qr_code' || !dashboard?.managerDefaultMethod) && (
                    <View style={styles.tabDefaultPill}>
                      <Text style={styles.tabDefaultPillText}>Default</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Modality Specific Details & Action Button */}
              {selectedMethod === 'qr_code' && (
                <View style={styles.methodContentBox}>
                  <View style={styles.methodInstructionCard}>
                    <View style={styles.instructionIconSquircle}>
                      <QrCode size={20} color="#0284c7" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.instructionTitle}>Office QR Code</Text>
                      <Text style={styles.instructionDesc}>
                        Scan the QR code displayed at your office entrance using your registered mobile.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    activeOpacity={0.88}
                    onPress={() => handleOpenCheckIn('qr_code', true)}
                  >
                    <Camera size={20} color="#ffffff" strokeWidth={2.2} />
                    <Text style={styles.primaryActionButtonText}>
                      Scan Office QR Code to Check In
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedMethod === 'wifi_ip' && (
                <View style={styles.methodContentBox}>
                  <View style={styles.methodInstructionCard}>
                    <View style={[styles.instructionIconSquircle, { backgroundColor: '#ecfdf5' }]}>
                      <Wifi size={20} color="#059669" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.instructionTitle}>Office Wi-Fi Network</Text>
                      <Text style={styles.instructionDesc}>
                        Verify attendance via connected office router gateway and IP geofence.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryActionButton, { backgroundColor: '#059669' }]}
                    activeOpacity={0.88}
                    onPress={() => handleOpenCheckIn('wifi_ip', false)}
                  >
                    <LogIn size={20} color="#ffffff" strokeWidth={2.2} />
                    <Text style={styles.primaryActionButtonText}>
                      Verify Network & Check In
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedMethod === 'biometric' && (
                <View style={styles.methodContentBox}>
                  <View style={styles.methodInstructionCard}>
                    <View style={[styles.instructionIconSquircle, { backgroundColor: '#faf5ff' }]}>
                      <Fingerprint size={20} color="#7c3aed" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.instructionTitle}>Device Biometric</Text>
                      <Text style={styles.instructionDesc}>
                        Authenticate securely via your device fingerprint or face sensor.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryActionButton, { backgroundColor: '#7c3aed' }]}
                    activeOpacity={0.88}
                    onPress={() => handleOpenCheckIn('biometric', false)}
                  >
                    <Fingerprint size={20} color="#ffffff" strokeWidth={2.2} />
                    <Text style={styles.primaryActionButtonText}>
                      Verify Biometric & Check In
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Attendance Verification Rules */}
              <View style={styles.rulesCard}>
                <Text style={styles.rulesTitle}>Attendance Verification Rules</Text>
                <Text style={styles.rulesText}>
                  1. Your registered mobile hardware is verified via strict cryptographic lock.
                </Text>
                <Text style={styles.rulesText}>
                  2. High-precision GPS geofencing confirms physical presence at an authorized office location.
                </Text>
                <Text style={styles.rulesText}>
                  3. Submit your mandatory daily log before checking out at the end of the day.
                </Text>
              </View>
            </View>
          ) : isCheckedOut ? (
            <DailyAttendanceReport
              attendance={todayAtt}
              onReportSent={() => fetchDashboard()}
            />
          ) : (
            /* Active Session In Progress */
            <View style={styles.sessionActiveContainer}>
              {/* Active Session Hero */}
              <View style={styles.activeSessionHero}>
                <View style={styles.activeSessionHeader}>
                  <View style={styles.sessionLiveBadge}>
                    <View style={styles.sessionPulsingDot} />
                    <Text style={styles.sessionLiveBadgeText}>
                      MAIN WORK SESSION ACTIVE
                    </Text>
                  </View>
                  <Text style={styles.startedAtText}>
                    Started at {startTimeStr}
                  </Text>
                </View>

                {/* Big Main Live Stopwatch */}
                <View style={styles.mainStopwatchCenter}>
                  <MainWorkTimer
                    checkInTime={todayAtt?.checkInTime}
                    checkOutTime={todayAtt?.checkOutTime}
                    breaks={breaksList}
                    activeBreak={activeBreak}
                  />
                  <Text style={styles.stopwatchSubText}>
                    Continuous Focus · Break Deductions: <Text style={{ color: '#d97706', fontWeight: 'bold' }}>-{completedBreakMins}m</Text>
                  </Text>
                </View>

                {/* Active Break Banner if currently on break */}
                {hasActiveBreak && (
                  <View style={styles.activeBreakHero}>
                    <View style={styles.activeBreakHeroTop}>
                      <Coffee size={16} color="#d97706" />
                      <Text style={styles.activeBreakHeroTitle}>
                        ACTIVE BREAK ({activeBreak.type?.toUpperCase() || 'GENERAL'})
                      </Text>
                    </View>
                    <BreakTimer startedAt={activeBreak.startedAt} />
                    <TouchableOpacity
                      style={styles.endBreakHeroBtn}
                      onPress={() => setBreakModalVisible(true)}
                    >
                      <Text style={styles.endBreakHeroBtnText}>
                        End Break & Resume Focus
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Step 1 & Step 2 Progression Cards */}
              {!hasActiveBreak && (
                <View style={styles.stepsContainer}>
                  {/* Step 1: Daily Work Log Sheet */}
                  <View
                    style={[
                      styles.stepCard,
                      isLogSubmitted
                        ? styles.stepCardSubmitted
                        : styles.stepCardPending,
                    ]}
                  >
                    <View style={styles.stepHeaderRow}>
                      <View style={styles.stepHeaderLeft}>
                        <View
                          style={[
                            styles.stepIconBox,
                            isLogSubmitted
                              ? { backgroundColor: '#dcfce7' }
                              : { backgroundColor: '#fef3c7' },
                          ]}
                        >
                          {isLogSubmitted ? (
                            <CheckCircle size={17} color="#16a34a" />
                          ) : (
                            <FileText size={17} color="#d97706" />
                          )}
                        </View>
                        <View style={styles.stepHeaderTextCol}>
                          <Text
                            style={[
                              styles.stepSubTitle,
                              isLogSubmitted ? { color: '#16a34a' } : { color: '#b45309' },
                            ]}
                          >
                            STEP 1 OF 2
                          </Text>
                          <Text style={styles.stepTitle}>Daily Work Log Sheet</Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.stepBadge,
                          isLogSubmitted
                            ? { backgroundColor: '#dcfce7', borderColor: '#86efac' }
                            : { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stepBadgeText,
                            isLogSubmitted ? { color: '#15803d' } : { color: '#b45309' },
                          ]}
                        >
                          {isLogSubmitted ? '✓ Submitted' : '⚠️ Mandatory'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.stepDesc}>
                      {isLogSubmitted
                        ? 'Today’s work summary is submitted. Shift check-out is unlocked.'
                        : 'Submit your daily work log sheet to unlock shift check-out.'}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.stepActionBtn,
                        isLogSubmitted && styles.stepActionBtnGhost,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (onNavigateDailyLog) onNavigateDailyLog();
                        else setDailyLogModalVisible(true);
                      }}
                    >
                      {isLogSubmitted ? (
                        <Check size={15} color="#15803d" />
                      ) : (
                        <FileText size={15} color="#ffffff" />
                      )}
                      <Text
                        style={[
                          styles.stepActionBtnText,
                          isLogSubmitted && styles.stepActionBtnGhostText,
                        ]}
                      >
                        {isLogSubmitted ? 'Update Submitted Daily Log' : 'Fill & Submit Daily Log Sheet'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Step 2: Check-Out Card */}
                  <View
                    style={[
                      styles.stepCard,
                      isLogSubmitted
                        ? styles.step2CardUnlocked
                        : styles.step2CardLocked,
                    ]}
                  >
                    <View style={styles.stepHeaderRow}>
                      <View style={styles.stepHeaderLeft}>
                        <View
                          style={[
                            styles.stepIconBox,
                            isLogSubmitted
                              ? { backgroundColor: '#ffe4e6' }
                              : { backgroundColor: '#f1f5f9' },
                          ]}
                        >
                          {isLogSubmitted ? (
                            <LogOut size={16} color="#e11d48" />
                          ) : (
                            <Lock size={16} color="#94a3b8" />
                          )}
                        </View>
                        <View style={styles.stepHeaderTextCol}>
                          <Text
                            style={[
                              styles.stepSubTitle,
                              isLogSubmitted ? { color: '#e11d48' } : { color: '#94a3b8' },
                            ]}
                          >
                            STEP 2 OF 2
                          </Text>
                          <Text
                            style={[
                              styles.stepTitle,
                              !isLogSubmitted && { color: '#64748b' },
                            ]}
                          >
                            Shift Check-Out
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.stepBadge,
                          isLogSubmitted
                            ? { backgroundColor: '#dcfce7', borderColor: '#86efac' }
                            : { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stepBadgeText,
                            isLogSubmitted ? { color: '#15803d' } : { color: '#64748b' },
                          ]}
                        >
                          {isLogSubmitted ? '🟢 Ready' : '🔒 Locked'}
                        </Text>
                      </View>
                    </View>

                    {!isLogSubmitted ? (
                      <TouchableOpacity
                        style={styles.checkoutBlockedBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          Alert.alert(
                            'Daily Log Required',
                            'Please complete Step 1 (submit your daily work log) before checking out.'
                          );
                          if (onNavigateDailyLog) onNavigateDailyLog();
                          else setDailyLogModalVisible(true);
                        }}
                      >
                        <Lock size={14} color="#94a3b8" />
                        <Text style={styles.checkoutBlockedBtnText}>
                          Check-Out Blocked (Submit Step 1 First)
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <TouchableOpacity
                          style={styles.checkoutUnlockedBtn}
                          disabled={checkoutLoading}
                          activeOpacity={0.85}
                          onPress={() => {
                            if (onStartCheckOut) onStartCheckOut();
                            Alert.alert(
                              'Confirm Check-Out',
                              'Are you sure you want to end your shift for today?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Check Out',
                                  style: 'destructive',
                                  onPress: () => executeCheckout(),
                                },
                              ]
                            );
                          }}
                        >
                          {checkoutLoading ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                          ) : (
                            <>
                              <LogOut size={17} color="#ffffff" />
                              <Text style={styles.checkoutUnlockedBtnText}>
                                Check Out & End Shift
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.scanPcCheckoutBtn}
                          activeOpacity={0.8}
                          onPress={() => setCheckoutScannerVisible(true)}
                        >
                          <Camera size={14} color="#0284c7" />
                          <Text style={styles.scanPcCheckoutBtnText}>
                            Scan PC Screen to Check Out
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Break Action Control */}
                  <TouchableOpacity
                    style={styles.takeBreakControlBtn}
                    activeOpacity={0.8}
                    onPress={() => setBreakModalVisible(true)}
                  >
                    <Coffee size={15} color="#d97706" />
                    <Text style={styles.takeBreakControlBtnText}>
                      Take Short Break
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
          </>
        )}

        {/* ── 8. Workday Time Breakdown Panel (Native SVG Donut) ── */}
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Workday Time Breakdown</Text>
              <Text style={styles.panelSubtitle}>
                {viewMode === 'Day' && isToday
                  ? "Today's distribution between productive work and breaks"
                  : `Distribution between work and breaks for ${displayDateText}`}
              </Text>
            </View>
            <View style={styles.panelBadge}>
              <Text style={styles.panelBadgeText}>
                {viewMode === 'Day' && isToday ? 'LIVE' : 'SUMMARY'}
              </Text>
            </View>
          </View>

          <DonutChart
            data={viewMode === 'Day' && isToday ? workBreakdownData : pastWorkBreakdownData}
            centerValue={
              viewMode === 'Day' && isToday
                ? `${Math.floor(liveWorkMins / 60)}h ${liveWorkMins % 60}m`
                : `${Math.floor((selectedDayRecord?.actualWorkMinutes || 0) / 60)}h ${(selectedDayRecord?.actualWorkMinutes || 0) % 60}m`
            }
            centerLabel="Work Time"
          />
        </View>

        {/* ── 9. Recent Attendance History Panel ── */}
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Recent Attendance</Text>
              <Text style={styles.panelSubtitle}>
                {history.length} logged record{history.length === 1 ? '' : 's'}
              </Text>
            </View>
            {onNavigateHistory && (
              <TouchableOpacity
                onPress={onNavigateHistory}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllBtnText}>View All →</Text>
              </TouchableOpacity>
            )}
          </View>

          {history.length === 0 ? (
            <Text style={styles.emptyHistoryText}>
              No past shifts recorded yet.
            </Text>
          ) : (
            <View style={styles.historyListMini}>
              {history.slice(0, 3).map((item) => {
                const work = item.actualWorkMinutes || item.totalWorkMinutes || 0;
                return (
                  <View key={item._id} style={styles.historyMiniRow}>
                    <View>
                      <Text style={styles.historyMiniDate}>
                        {formatDate(item.date)}
                      </Text>
                      <Text style={styles.historyMiniTimes}>
                        {item.checkInTime ? formatTime(item.checkInTime) : '—'}{' '}
                        –{' '}
                        {item.checkOutTime ? formatTime(item.checkOutTime) : 'In Progress'}
                      </Text>
                    </View>
                    <View style={styles.historyMiniRight}>
                      <Text style={styles.historyMiniWork}>
                        {formatDuration(work)}
                      </Text>
                      <Text style={styles.historyMiniStatus}>
                        {item.status?.toUpperCase() || 'PRESENT'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Floating Logout Pill matching Web Screenshot media_1789975087252.png ── */}
      <TouchableOpacity
        style={styles.floatingLogoutPill}
        onPress={logout}
        activeOpacity={0.85}
      >
        <LogOut size={15} color="#e11d48" style={{ marginRight: 6 }} />
        <Text style={styles.floatingLogoutText}>Logout</Text>
      </TouchableOpacity>

      {/* ── 11. Slide-Over Navigation Drawer Modal ── */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerBackdrop}>
          <TouchableOpacity
            style={styles.drawerDismissArea}
            activeOpacity={1}
            onPress={() => setDrawerVisible(false)}
          />
          <View style={styles.drawerContent}>
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerHeaderBrand}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 120, height: 32 }}
                  resizeMode="contain"
                />
                <View style={styles.employeeTag}>
                  <Text style={styles.employeeTagText}>Employee</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setDrawerVisible(false)}
                style={styles.drawerCloseBtn}
              >
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Profile Brief in Drawer */}
            <View style={styles.drawerProfileCard}>
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.drawerAvatarImg}
                />
              ) : (
                <View style={styles.drawerAvatar}>
                  <Text style={styles.drawerAvatarText}>
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.drawerProfileName}>{user?.name || 'Employee'}</Text>
                <Text style={styles.drawerProfileRole}>
                  {dashboard?.teamName || 'Spheronix Team'}
                </Text>
              </View>
            </View>

            {/* Socket Status Pill in Drawer */}
            <View style={styles.drawerSocketRow}>
              <View
                style={[
                  styles.connectionIndicator,
                  { backgroundColor: isConnected ? '#10b981' : '#f43f5e' },
                ]}
              />
              <Text style={styles.drawerSocketText}>
                {isConnected ? 'Attendance System Connected' : 'Disconnected / Reconnecting'}
              </Text>
            </View>

            {/* Navigation Links */}
            <View style={styles.drawerNavList}>
              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => setDrawerVisible(false)}
              >
                <Timer size={18} color="#0284c7" />
                <Text style={[styles.drawerNavItemText, { color: '#0284c7', fontWeight: 'bold' }]}>
                  Home Page
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  setDrawerVisible(false);
                  if (onNavigateHistory) onNavigateHistory();
                }}
              >
                <Calendar size={18} color="#475569" />
                <Text style={styles.drawerNavItemText}>Attendance History</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  setDrawerVisible(false);
                  if (onNavigateDailyLog) onNavigateDailyLog();
                  else setDailyLogModalVisible(true);
                }}
              >
                <FileText size={18} color="#475569" />
                <Text style={styles.drawerNavItemText}>Daily Work Log</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  setDrawerVisible(false);
                  if (onNavigateOvertime) onNavigateOvertime();
                }}
              >
                <Clock size={18} color="#475569" />
                <Text style={styles.drawerNavItemText}>Overtime Management</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  setDrawerVisible(false);
                  if (onNavigateLeave) onNavigateLeave();
                }}
              >
                <Calendar size={18} color="#475569" />
                <Text style={styles.drawerNavItemText}>Leave Requests</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  setDrawerVisible(false);
                  if (onNavigateDevice) onNavigateDevice();
                }}
              >
                <Smartphone size={18} color="#475569" />
                <Text style={styles.drawerNavItemText}>Device Security</Text>
              </TouchableOpacity>


              {onNavigateNotifications && (
                <TouchableOpacity
                  style={styles.drawerNavItem}
                  onPress={() => {
                    setDrawerVisible(false);
                    setUnreadCount(0);
                    onNavigateNotifications();
                  }}
                >
                  <Bell size={18} color="#475569" />
                  <Text style={styles.drawerNavItemText}>Notifications</Text>
                  {unreadCount > 0 && (
                    <View style={styles.drawerBadge}>
                      <Text style={styles.drawerBadgeText}>
                        {unreadCount > 9 ? '9+' : String(unreadCount)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {onNavigateProfile && (
                <TouchableOpacity
                  style={styles.drawerNavItem}
                  onPress={() => {
                    setDrawerVisible(false);
                    onNavigateProfile();
                  }}
                >
                  <Text style={{ fontSize: 16 }}>👤</Text>
                  <Text style={styles.drawerNavItemText}>Profile Details</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Logout at Bottom of Drawer */}
            <TouchableOpacity
              style={styles.drawerLogoutBtn}
              onPress={() => {
                setDrawerVisible(false);
                logout();
              }}
            >
              <LogOut size={18} color="#e11d48" style={{ marginRight: 8 }} />
              <Text style={styles.drawerLogoutBtnText}>Log Out Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Break Controls Modal */}
      <BreakModal
        visible={breakModalVisible}
        onClose={() => setBreakModalVisible(false)}
        activeBreak={activeBreak}
        checkInTime={todayAtt?.checkInTime}
        onSuccess={() => fetchDashboard()}
      />

      {/* Check-In Verification Modal (Biometric / Wi-Fi / QR) */}
      <CheckInModal
        visible={checkInModalVisible}
        onClose={() => setCheckInModalVisible(false)}
        dashboard={dashboard}
        initialMethod={checkInInitialMethod}
        autoOpenScanner={checkInAutoOpenScanner}
        onSuccess={() => fetchDashboard()}
      />

      {/* Daily Work Log Compliance Modal */}
      <DailyLogModal
        visible={dailyLogModalVisible}
        onClose={() => setDailyLogModalVisible(false)}
        onSuccess={() => {
          fetchDashboard();
          Alert.alert('Daily Log Verified', 'Log submitted! Now proceeding to check-out.');
          executeCheckout();
        }}
      />

      {/* Geofence Out-of-Bounds Escalation Alert Modal (Levels 1-5) */}
      <GeofenceAlertModal />

      {/* Post-Checkout Shift Attendance Report Modal */}
      <AttendanceReportModal
        visible={reportModalVisible}
        reportData={reportData}
        onClose={() => setReportModalVisible(false)}
      />

      {/* Cross-Device PC Checkout QR Scanner Modal */}
      <Modal
        visible={checkoutScannerVisible}
        animationType="slide"
        onRequestClose={() => setCheckoutScannerVisible(false)}
      >
        <CheckoutQrScanner
          onScan={(token) => executeCheckout({ token })}
          onClose={() => setCheckoutScannerVisible(false)}
        />
      </Modal>

      {/* Out-of-Bounds Reactivation Explanation Modal */}
      <Modal
        visible={reasonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonModalVisible(false)}
      >
        <View style={styles.reasonModalBackdrop}>
          <View style={styles.reasonModalCard}>
            <Text style={styles.reasonModalTitle}>Session Reactivation Request</Text>
            <Text style={styles.reasonModalSub}>
              Explain why you were outside the office perimeter to request manager reactivation.
            </Text>
            <TextInput
              style={styles.reasonInput}
              multiline
              numberOfLines={4}
              placeholder="e.g. Attending client meeting outside premises..."
              placeholderTextColor="#94a3b8"
              value={reasonInput}
              onChangeText={setReasonInput}
            />
            <View style={styles.reasonBtnRow}>
              <TouchableOpacity
                style={styles.reasonCancelBtn}
                onPress={() => setReasonModalVisible(false)}
                disabled={submittingReason}
              >
                <Text style={styles.reasonCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reasonSubmitBtn}
                onPress={handleSubmitReactivationReason}
                disabled={submittingReason}
              >
                {submittingReason ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.reasonSubmitBtnText}>Submit to Manager</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },

  /* ── 1. Top Brand Header Bar ── */
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
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 135,
    height: 36,
  },
  employeeTag: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  employeeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  brandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hamburgerBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  /* ── Scroll Area ── */
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 14,
  },

  /* ── 2. Greeting Header ── */
  greetingSection: {
    gap: 4,
  },
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

  /* ── 3. Date Control Strip ── */
  dateControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  viewModeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
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
  dateChevronBtn: {
    padding: 5,
  },
  dateCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  dateCenterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
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

  /* ── 4. Secondary Horizontal Tab Strip ── */
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 2,
    gap: 14,
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
  subTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  subTabTextActive: {
    color: '#db2777',
    fontWeight: '700',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -2,
    left: 4,
    right: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#db2777',
  },
  tabMandatoryChip: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabMandatoryChipText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#ea580c',
  },

  /* ── 5. The 6-Tile Pastel KPI Grid ── */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  kpiChipText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  kpiValueText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  kpiLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 3,
  },

  /* ── 6. Attendance Device Status Card ── */
  deviceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  deviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    paddingBottom: 12,
  },
  deviceHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deviceIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  deviceCardSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  deviceViewBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deviceViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  deviceCardBody: {
    paddingTop: 12,
    gap: 4,
  },
  deviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  deviceStatusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
  },
  deviceModelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  deviceDescText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },

  /* ── 7. Attendance Method Action Panel ── */
  methodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    gap: 14,
  },
  methodHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  methodHeaderMethodCode: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7c3aed',
    fontFamily: 'monospace',
  },
  methodStatusBadge: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  methodStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7c3aed',
  },

  /* Unchecked State Method Selector Strip */
  methodUncheckedContainer: {
    gap: 14,
  },
  methodSwitcherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#edf2f7',
    borderRadius: 20,
    padding: 5,
    gap: 4,
    minHeight: 56,
  },
  methodTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 14,
    gap: 5,
    minHeight: 44,
  },
  methodTabItemActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    shadowColor: '#0284c7',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  methodTabItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  methodTabItemTextActive: {
    fontWeight: '700',
    color: '#0284c7',
  },
  stackedTextCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stackedTextLine: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 13,
  },
  stackedTextLineActive: {
    fontWeight: '700',
    color: '#0284c7',
  },
  tabDefaultPill: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 999,
    marginLeft: 2,
  },
  tabDefaultPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#0284c7',
  },

  /* Method Content Area */
  methodContentBox: {
    gap: 12,
  },
  methodInstructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
  },
  instructionIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  instructionDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 15,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  primaryActionButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },

  /* Attendance Verification Rules */
  rulesCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    padding: 13,
    gap: 4,
  },
  rulesTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  rulesText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },

  /* Active Session Details */
  sessionActiveContainer: {
    gap: 14,
  },
  activeSessionHero: {
    backgroundColor: '#f0fdf4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    gap: 12,
  },
  activeSessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  sessionLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  sessionPulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  sessionLiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
    letterSpacing: 0.4,
  },
  startedAtText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  mainStopwatchCenter: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  stopwatchSubText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  activeBreakHero: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  activeBreakHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeBreakHeroTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 0.3,
  },
  endBreakHeroBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  endBreakHeroBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Step 1 & Step 2 Progression Cards */
  stepsContainer: {
    gap: 12,
  },
  stepCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  stepCardPending: {
    backgroundColor: '#fffdfa',
    borderColor: '#fed7aa',
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  stepCardSubmitted: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  step2CardLocked: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  step2CardUnlocked: {
    backgroundColor: '#ffffff',
    borderColor: '#fecdd3',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  stepIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepHeaderTextCol: {
    flex: 1,
    marginLeft: 9,
    justifyContent: 'center',
  },
  stepSubTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  stepBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stepDesc: {
    fontSize: 11.5,
    color: '#64748b',
    lineHeight: 16,
  },
  stepActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  stepActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  stepActionBtnGhost: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#86efac',
    shadowOpacity: 0,
    elevation: 0,
  },
  stepActionBtnGhostText: {
    color: '#15803d',
  },
  checkoutBlockedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  checkoutBlockedBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  checkoutUnlockedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#e11d48',
    borderRadius: 12,
    paddingVertical: 12,
    shadowColor: '#e11d48',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  checkoutUnlockedBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  scanPcCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 10,
  },
  scanPcCheckoutBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  takeBreakControlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fffdfa',
    borderWidth: 1.5,
    borderColor: '#fef08a',
    borderRadius: 12,
    paddingVertical: 11,
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  takeBreakControlBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#b45309',
  },

  /* ── 8. Workday Breakdown Panel ── */
  panelCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 14,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  panelSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
  },
  panelBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  panelBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0284c7',
  },

  /* ── 9. Attendance History Panel ── */
  viewAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  viewAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 14,
  },
  historyListMini: {
    gap: 10,
  },
  historyMiniRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  historyMiniDate: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1e293b',
  },
  historyMiniTimes: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  historyMiniRight: {
    alignItems: 'flex-end',
  },
  historyMiniWork: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  historyMiniStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 2,
  },

  /* Floating Logout Pill */
  floatingLogoutPill: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: '#e11d48',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 99,
  },
  floatingLogoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e11d48',
  },

  /* ── 11. Slide-Over Drawer Modal ── */
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    flexDirection: 'row',
  },
  drawerDismissArea: {
    flex: 1,
  },
  drawerContent: {
    width: 280,
    backgroundColor: '#ffffff',
    height: '100%',
    padding: 18,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  drawerHeaderBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drawerCloseBtn: {
    padding: 6,
  },
  drawerProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    marginVertical: 14,
  },
  drawerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  drawerAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#e0e7ff',
  },
  drawerProfileName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  drawerProfileRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  drawerSocketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  drawerSocketText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748b',
  },
  drawerNavList: {
    gap: 6,
    flex: 1,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerNavItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  drawerBadge: {
    marginLeft: 'auto',
    backgroundColor: '#e11d48',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  drawerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  drawerLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    paddingVertical: 12,
  },
  drawerLogoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e11d48',
  },

  /* Presence Verified Banner */
  presenceVerifiedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  presenceCheckCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presenceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presenceTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  inPerimeterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  greenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  inPerimeterText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803d',
  },
  presenceSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  secureBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },

  /* Auto checkout banners */
  autoCheckoutBannerContainer: {
    gap: 8,
  },
  reactivationPendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  reactivationIconCol: {
    padding: 4,
  },
  reactivationBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  reactivationTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400e',
  },
  pendingReviewPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  pendingReviewPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#b45309',
  },
  reactivationReasonText: {
    fontSize: 11,
    color: '#78350f',
    marginTop: 2,
  },
  refreshReactivationBtn: {
    padding: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  reactivationRejectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 16,
    padding: 12,
  },
  reactivationRejectedTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#9f1239',
  },
  reactivationRejectedSub: {
    fontSize: 11,
    color: '#881337',
    marginTop: 2,
  },
  sessionSuspendedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 16,
    padding: 12,
  },
  sessionSuspendedTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#9f1239',
  },
  sessionSuspendedSub: {
    fontSize: 11,
    color: '#881337',
    marginTop: 2,
  },
  explainReasonBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  explainReasonBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Reason modal */
  reasonModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reasonModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  reasonModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  reasonModalSub: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
    minHeight: 90,
  },
  reasonBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  reasonCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  reasonCancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  reasonSubmitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#0284c7',
  },
  reasonSubmitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Access denied container */
  accessDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  accessDeniedIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#991b1b',
  },
  accessDeniedDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  accessDeniedPrimaryBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 12,
  },
  accessDeniedPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  accessDeniedGhostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  accessDeniedGhostBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  /* Heartbeat Monitoring Status Banner matching Web */
  heartbeatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    gap: 8,
  },
  heartbeatBannerOn: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  heartbeatBannerOff: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  heartbeatBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  heartbeatBannerText: {
    fontSize: 11.5,
    fontWeight: '500',
    flex: 1,
  },
  heartbeatTextOn: {
    color: '#92400e',
  },
  heartbeatTextOff: {
    color: '#475569',
  },
  heartbeatPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heartbeatPillOn: {
    backgroundColor: '#fde68a',
  },
  heartbeatPillOff: {
    backgroundColor: '#e2e8f0',
  },
  heartbeatPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  heartbeatPillTextOn: {
    color: '#78350f',
  },
  heartbeatPillTextOff: {
    color: '#334155',
  },

  /* Date Notice Banner */
  dateNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    gap: 10,
  },
  dateNoticeTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6b21a8',
  },
  dateNoticeSub: {
    fontSize: 11,
    color: '#7e22ce',
    marginTop: 2,
  },
  jumpTodayBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  jumpTodayBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  jumpTodayBtnSmall: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jumpTodayBtnSmallText: {
    color: '#7c3aed',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Close Presence Button */
  closePresenceBtn: {
    padding: 4,
    alignSelf: 'flex-start',
  },

  /* Weekly Grid & Cards */
  weekDaysGrid: {
    gap: 8,
    marginTop: 8,
  },
  weekDayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekDayCardActive: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  weekDayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekDayName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    width: 36,
  },
  weekDayDate: {
    fontSize: 12,
    color: '#64748b',
  },
  weekDayBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekDayHours: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  weekDayStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  weekDayStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },

  /* Monthly List */
  emptyMonthBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyMonthTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyMonthSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 3,
  },
  monthRecsList: {
    gap: 8,
    marginTop: 8,
  },
  monthRecItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  monthRecLeft: {
    gap: 2,
  },
  monthRecDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  monthRecTimes: {
    fontSize: 11,
    color: '#64748b',
  },
  monthRecRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthRecHours: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },

  /* Past Day Record Card */
  pastRecordCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginTop: 6,
  },
  pastRecordStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pastRecordBadge: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pastRecordBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
  },
  pastRecordMethod: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  pastRecordDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pastDetailCol: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  pastDetailLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  pastDetailValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 3,
  },
  pastRecordFooter: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  pastRecordFooterText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  emptyPastBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyPastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyPastSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 3,
    textAlign: 'center',
  },
});

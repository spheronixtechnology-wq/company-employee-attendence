import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Home,
  Bell,
  CheckCircle2,
  XCircle,
  Calendar,
  Smartphone,
  Shield,
  ShieldOff,
  Zap,
  ZapOff,
  RefreshCw,
  FileText,
  ClipboardList,
} from 'lucide-react-native';
import api from '../../lib/api';
import { useSocket } from '../../contexts/SocketContext';

// ─── Notification type → icon + color ─────────────────────────────────────────
const TYPE_CONFIG = {
  leave_applied:                    { Icon: Calendar,      color: '#0ea5e9', bg: '#f0f9ff' },
  leave_approved:                   { Icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4' },
  leave_rejected:                   { Icon: XCircle,       color: '#dc2626', bg: '#fef2f2' },
  leave_overridden:                 { Icon: Calendar,      color: '#f59e0b', bg: '#fffbeb' },
  attendance_override:              { Icon: RefreshCw,     color: '#f59e0b', bg: '#fffbeb' },
  daily_log_reminder:               { Icon: FileText,      color: '#f59e0b', bg: '#fffbeb' },
  manual_attendance_submitted:      { Icon: ClipboardList, color: '#8b5cf6', bg: '#faf5ff' },
  manual_attendance_approved:       { Icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4' },
  manual_attendance_rejected:       { Icon: XCircle,       color: '#dc2626', bg: '#fef2f2' },
  device_approved:                  { Icon: Shield,        color: '#16a34a', bg: '#f0fdf4' },
  device_rejected:                  { Icon: ShieldOff,     color: '#dc2626', bg: '#fef2f2' },
  device_request_submitted:         { Icon: Smartphone,    color: '#6366f1', bg: '#eef2ff' },
  device_unregistered_attempt:      { Icon: Smartphone,    color: '#dc2626', bg: '#fef2f2' },
  location_request_submitted:       { Icon: Zap,           color: '#6366f1', bg: '#eef2ff' },
  session_reactivated:              { Icon: Zap,           color: '#16a34a', bg: '#f0fdf4' },
  session_reactivation_rejected:    { Icon: ZapOff,        color: '#dc2626', bg: '#fef2f2' },
  general:                          { Icon: Bell,          color: '#6366f1', bg: '#eef2ff' },
};

const getConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.general;

// ─── Relative time helper ─────────────────────────────────────────────────────
const formatRelativeTime = (isoDate) => {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// ─── Notification card ────────────────────────────────────────────────────────
function NotifCard({ item }) {
  const { Icon, color, bg } = getConfig(item.type);
  const isUnread = !item.isRead;

  return (
    <View style={[styles.card, isUnread && styles.cardUnread]}>
      {isUnread && <View style={[styles.unreadBar, { backgroundColor: color }]} />}
      <View style={[styles.iconBox, { backgroundColor: bg }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {isUnread && <View style={[styles.unreadDot, { backgroundColor: color }]} />}
        </View>
        <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>
        <Text style={styles.cardTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationsScreen({ onBack }) {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    try {
      const res = await api.get('/employee/notifications');
      setNotifications(res.data?.data?.notifications || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time: prepend new notifications live
  useEffect(() => {
    if (!socket) return;
    const onNew = (data) => {
      if (data?.notification) {
        setNotifications((prev) => [data.notification, ...prev]);
      } else {
        // Fallback: just refresh from server
        fetchNotifications(false);
      }
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [socket, fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const totalCount  = notifications.length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Dark Hero Header ──────────────────────────────────────── */}
      <View style={styles.heroHeader}>
        <View style={styles.heroNav}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.navBackPill} activeOpacity={0.8}>
              <ArrowLeft size={14} color="#94a3b8" />
              <Text style={styles.navBackText}>Back to Home</Text>
            </TouchableOpacity>
          ) : <View />}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.navHomeBtn} activeOpacity={0.8}>
              <Home size={15} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.heroContent}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Bell size={10} color="#818cf8" />
              <Text style={styles.heroBadgeText}>INBOX</Text>
            </View>
            {unreadCount > 0 && (
              <View style={[styles.heroBadge, { backgroundColor: 'rgba(225,29,72,0.18)' }]}>
                <Text style={[styles.heroBadgeText, { color: '#fb7185' }]}>
                  {unreadCount} UNREAD
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.heroTitle}>Notifications</Text>
          <Text style={styles.heroSubtitle}>
            {totalCount > 0
              ? `${totalCount} notification${totalCount > 1 ? 's' : ''} · ${unreadCount} unread`
              : 'Your notification history will appear here'}
          </Text>
        </View>
      </View>

      {/* ── List ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchNotifications(true)}
            colors={['#6366f1']}
            tintColor="#6366f1"
          />
        }
      >
        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.stateText}>Loading notifications…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Bell size={32} color="#c7d2fe" />
            </View>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              You have no notifications yet. Approvals, alerts, and updates will appear here.
            </Text>
          </View>
        ) : (
          <>
            {notifications.map((item) => (
              <NotifCard key={item._id} item={item} />
            ))}
          </>
        )}

        {/* ── Bottom Back Button ──────────────────────────────────── */}
        {onBack && (
          <TouchableOpacity style={styles.bottomBackBtn} activeOpacity={0.8} onPress={onBack}>
            <Home size={15} color="#334155" />
            <Text style={styles.bottomBackBtnText}>Back to Home Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  /* ── Hero Header ── */
  heroHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  navBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navBackText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  navHomeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingTop: 4,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#818cf8',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    lineHeight: 18,
  },

  /* ── Scroll ── */
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },

  /* ── Card ── */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  cardUnread: {
    borderColor: '#e0e7ff',
    backgroundColor: '#fafbff',
    shadowOpacity: 0.07,
    elevation: 3,
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  cardBody: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  cardMessage: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    fontWeight: '500',
    marginBottom: 5,
  },
  cardTime: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },

  /* ── States ── */
  centeredState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  stateText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '500',
  },

  /* ── Bottom nav ── */
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 6,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bottomBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import api from '../../lib/api';
import { ArrowLeft, Home, RefreshCw, Calendar, Clock, Coffee } from 'lucide-react-native';
import { formatDuration, formatTime, formatDate } from '../../utils/workMetrics';

const StatusBadge = ({ status }) => {
  const config = {
    present: { label: 'Present', bg: '#ecfdf5', text: '#059669' },
    half_day: { label: 'Half Day', bg: '#fffbeb', text: '#d97706' },
    absent: { label: 'Absent', bg: '#fef2f2', text: '#dc2626' },
    leave: { label: 'On Leave', bg: '#f0f9ff', text: '#0284c7' },
    incomplete: { label: 'Incomplete', bg: '#f1f5f9', text: '#64748b' },
    manual_pending: { label: 'Pending', bg: '#faf5ff', text: '#9333ea' },
  };

  const item = config[status] || {
    label: status || 'Pending',
    bg: '#f1f5f9',
    text: '#64748b',
  };

  return (
    <View style={[styles.statusBadge, { backgroundColor: item.bg }]}>
      <Text style={[styles.statusBadgeText, { color: item.text }]}>
        {item.label}
      </Text>
    </View>
  );
};

export default function AttendanceHistoryScreen({ onBack }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchAttendance = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get('/employee/attendance/me');
      setRecords(res.data?.data?.attendance || []);
      setSummary(res.data?.data?.summary || null);
    } catch (err) {
      console.error('Error fetching attendance history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backHomeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Back to Home Dashboard"
            >
              <ArrowLeft size={16} color="#0f172a" />
              <Text style={styles.backHomeBtnText}>Back to Home</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              onPress={() => fetchAttendance(true)}
              style={styles.actionIconBtn}
              activeOpacity={0.7}
              accessibilityLabel="Refresh attendance"
            >
              <RefreshCw size={16} color="#0284c7" />
            </TouchableOpacity>

            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                style={styles.actionIconBtn}
                activeOpacity={0.7}
                accessibilityLabel="Home Dashboard"
              >
                <Home size={16} color="#0284c7" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Attendance History</Text>
          <Text style={styles.headerSubtitle}>
            Past shifts, verified hours, and break logs
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAttendance(true)}
            colors={['#6366f1']}
          />
        }
      >
        {/* Summary Stat Cards */}
        {summary && (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Days</Text>
              <Text style={styles.summaryValue}>{summary.totalDays || 0}</Text>
              <Text style={styles.summarySub}>Recorded shifts</Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardGreen]}>
              <Text style={[styles.summaryLabel, styles.textGreen]}>Present</Text>
              <Text style={[styles.summaryValue, styles.textGreen]}>
                {summary.presentCount || 0}
              </Text>
              <Text style={styles.summarySub}>Full shifts</Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardAmber]}>
              <Text style={[styles.summaryLabel, styles.textAmber]}>Half Day</Text>
              <Text style={[styles.summaryValue, styles.textAmber]}>
                {summary.halfDayCount || 0}
              </Text>
              <Text style={styles.summarySub}>Short shifts</Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardIndigo]}>
              <Text style={[styles.summaryLabel, styles.textIndigo]}>Total Hours</Text>
              <Text style={[styles.summaryValue, styles.textIndigo]}>
                {summary.totalHours || 0}h
              </Text>
              <Text style={styles.summarySub}>Net productive</Text>
            </View>
          </View>
        )}

        {/* Attendance List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Loading attendance records...</Text>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No attendance records found</Text>
            <Text style={styles.emptySub}>
              Once you check in and check out, your attendance logs will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.recordsList}>
            {records.map((rec) => {
              const isExpanded = expandedId === rec._id;
              const breaks = rec.breaks || [];
              const hasBreaks = breaks.length > 0;
              const totalWork =
                rec.actualWorkMinutes ?? rec.totalWorkMinutes ?? 0;
              const totalBreak =
                rec.totalBreakMinutes ?? rec.completedBreakMinutes ?? 0;

              return (
                <View key={rec._id} style={styles.recordCard}>
                  <TouchableOpacity
                    style={styles.recordHeader}
                    onPress={() => hasBreaks && toggleExpand(rec._id)}
                    activeOpacity={hasBreaks ? 0.7 : 1}
                  >
                    <View style={styles.recordHeaderTop}>
                      <Text style={styles.recordDate}>
                        {formatDate(rec.date)}
                      </Text>
                      <StatusBadge status={rec.status} />
                    </View>

                    {/* Times row */}
                    <View style={styles.timesRow}>
                      <Text style={styles.timeTag}>
                        <Text style={styles.tagLabel}>In: </Text>
                        {rec.checkInTime ? formatTime(rec.checkInTime) : '—'}
                      </Text>
                      <Text style={styles.dotSeparator}>•</Text>
                      <Text style={styles.timeTag}>
                        <Text style={styles.tagLabel}>Out: </Text>
                        {rec.checkOutTime ? (
                          formatTime(rec.checkOutTime)
                        ) : (
                          <Text style={styles.inProgressText}>
                            ● Live in progress
                          </Text>
                        )}
                      </Text>
                    </View>

                    {/* Work & Break Summary */}
                    <View style={styles.recordFooter}>
                      <View style={styles.workHoursBadge}>
                        <Text style={styles.workHoursText}>
                          ⏱️ {totalWork > 0 ? formatDuration(totalWork) : '0m'}
                        </Text>
                      </View>

                      {totalBreak > 0 && (
                        <Text style={styles.breaksSummaryText}>
                          ☕ {breaks.length} break{breaks.length > 1 ? 's' : ''} (
                          {formatDuration(totalBreak)})
                        </Text>
                      )}

                      {hasBreaks && (
                        <Text style={styles.expandChevron}>
                          {isExpanded ? '▲' : '▼'}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Collapsible Breaks Breakdown */}
                  {isExpanded && hasBreaks && (
                    <View style={styles.breakdownContainer}>
                      <Text style={styles.breakdownHeaderTitle}>
                        BREAKS BREAKDOWN
                      </Text>
                      {breaks.map((b, bIdx) => {
                        const bStart = b.startedAt ? formatTime(b.startedAt) : '—';
                        const bEnd = b.endedAt ? formatTime(b.endedAt) : 'Active';
                        const dur =
                          b.startedAt && b.endedAt
                            ? Math.max(
                                0,
                                Math.floor(
                                  (new Date(b.endedAt).getTime() -
                                    new Date(b.startedAt).getTime()) /
                                    60000
                                )
                              )
                            : 0;

                        return (
                          <View
                            key={b._id || bIdx}
                            style={styles.breakdownItemRow}
                          >
                            <Text style={styles.breakTypeName}>
                              #{bIdx + 1} {b.type || 'Personal'} Break
                            </Text>
                            <Text style={styles.breakTimeRange}>
                              {bStart} – {bEnd}{' '}
                              <Text style={styles.breakDur}>({dur}m)</Text>
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Bottom Back to Home Button */}
        {onBack && (
          <TouchableOpacity
            style={styles.bottomBackBtn}
            activeOpacity={0.8}
            onPress={onBack}
          >
            <Home size={16} color="#334155" />
            <Text style={styles.bottomBackBtnText}>Back to Home Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backHomeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  headerTitleBox: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '500',
  },
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 18,
    marginBottom: 20,
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
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryCardGreen: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  summaryCardAmber: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  summaryCardIndigo: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 2,
    fontFamily: 'monospace',
  },
  summarySub: {
    fontSize: 9,
    color: '#94a3b8',
  },
  textGreen: {
    color: '#059669',
  },
  textAmber: {
    color: '#d97706',
  },
  textIndigo: {
    color: '#4f46e5',
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  recordsList: {
    gap: 12,
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recordHeader: {
    padding: 16,
  },
  recordHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  timeTag: {
    fontSize: 12,
    color: '#334155',
    fontFamily: 'monospace',
  },
  tagLabel: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  dotSeparator: {
    color: '#cbd5e1',
  },
  inProgressText: {
    color: '#10b981',
    fontWeight: '700',
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 2,
  },
  workHoursBadge: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  workHoursText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
    fontFamily: 'monospace',
  },
  breaksSummaryText: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: '600',
  },
  expandChevron: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 4,
  },
  breakdownContainer: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 14,
    gap: 8,
  },
  breakdownHeaderTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
  },
  breakdownItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  breakTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  breakTimeRange: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  breakDur: {
    color: '#d97706',
    fontWeight: '700',
  },
});

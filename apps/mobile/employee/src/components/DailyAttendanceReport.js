import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api from '../lib/api';
import { formatDuration, formatTime, formatDate } from '../utils/workMetrics';

export default function DailyAttendanceReport({ attendance, onReportSent }) {
  const [sending, setSending] = useState(false);
  const breaks = attendance?.breaks || [];
  const checkIn = attendance?.checkInTime;
  const checkOut = attendance?.checkOutTime;

  const totalDurationMins =
    attendance?.totalDurationMinutes ??
    (checkIn && checkOut
      ? Math.max(
          0,
          Math.floor(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000
          )
        )
      : 0);

  const totalBreakMins =
    attendance?.totalBreakMinutes ??
    attendance?.completedBreakMinutes ??
    0;

  const actualWorkMins =
    attendance?.actualWorkMinutes ??
    Math.max(0, totalDurationMins - totalBreakMins);

  const handleSendReport = async () => {
    setSending(true);
    try {
      await api.post('/employee/attendance/send-report');
      Alert.alert('Report Sent', 'Shift report has been emailed to your manager.');
      onReportSent?.();
    } catch (err) {
      Alert.alert(
        'Failed to Send Report',
        err.response?.data?.message || 'Could not send report at this time.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.checkIconBadge}>
          <Text style={styles.checkIconText}>✓</Text>
        </View>
        <Text style={styles.headerTitle}>Daily Attendance Report</Text>
        <Text style={styles.headerSubtitle}>Shift completed for today</Text>

        <View style={styles.dateStatusChip}>
          <Text style={styles.chipDateText}>
            {checkIn ? formatDate(checkIn) : 'Today'}
          </Text>
          <Text style={styles.chipSeparator}>·</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {(attendance?.status || 'PRESENT').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* 3 Metrics Cards */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Duration</Text>
          <Text style={styles.metricValue}>
            {formatDuration(totalDurationMins)}
          </Text>
          <Text style={styles.metricSub}>Gross Shift</Text>
        </View>

        <View style={[styles.metricCard, styles.metricCardAmber]}>
          <Text style={[styles.metricLabel, styles.metricLabelAmber]}>
            Total Breaks
          </Text>
          <Text style={[styles.metricValue, styles.metricValueAmber]}>
            {formatDuration(totalBreakMins)}
          </Text>
          <Text style={styles.metricSub}>
            {breaks.length} break{breaks.length === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={[styles.metricCard, styles.metricCardEmerald]}>
          <Text style={[styles.metricLabel, styles.metricLabelEmerald]}>
            Actual Work
          </Text>
          <Text style={[styles.metricValue, styles.metricValueEmerald]}>
            {formatDuration(actualWorkMins)}
          </Text>
          <Text style={styles.metricSub}>Net Productive</Text>
        </View>
      </View>

      {/* Inset Times Box */}
      <View style={styles.timesBox}>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Check-in Time:</Text>
          <Text style={styles.timeValue}>{formatTime(checkIn)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Check-out Time:</Text>
          <Text style={styles.timeValue}>{formatTime(checkOut)}</Text>
        </View>
      </View>

      {/* Break Breakdown */}
      <View style={styles.breakdownBox}>
        <View style={styles.breakdownHeader}>
          <Text style={styles.breakdownTitle}>BREAK BREAKDOWN</Text>
          <Text style={styles.breakdownTotal}>
            {formatDuration(totalBreakMins)}
          </Text>
        </View>

        {breaks.length === 0 ? (
          <Text style={styles.noBreaksText}>
            No breaks recorded during this shift.
          </Text>
        ) : (
          breaks.map((b, idx) => {
            const bStart = b.startedAt ? formatTime(b.startedAt) : '—';
            const bEnd = b.endedAt ? formatTime(b.endedAt) : 'In progress';
            const durationMins =
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
              <View key={b._id || idx} style={styles.breakItem}>
                <Text style={styles.breakItemName}>
                  #{idx + 1} {b.type || 'Personal'} Break
                </Text>
                <Text style={styles.breakItemTime}>
                  {bStart} – {bEnd} ({durationMins}m)
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Send Report Action */}
      <TouchableOpacity
        style={styles.sendReportBtn}
        onPress={handleSendReport}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.sendReportBtnText}>
            ✉️ Send Report to Manager
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    marginVertical: 10,
  },
  headerCard: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  checkIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkIconText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064e3b',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  dateStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  chipDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  chipSeparator: {
    marginHorizontal: 6,
    color: '#cbd5e1',
  },
  statusBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065f46',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
  },
  metricCardAmber: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  metricCardEmerald: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricLabelAmber: {
    color: '#b45309',
  },
  metricLabelEmerald: {
    color: '#047857',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
    fontFamily: 'monospace',
  },
  metricValueAmber: {
    color: '#d97706',
  },
  metricValueEmerald: {
    color: '#059669',
  },
  metricSub: {
    fontSize: 10,
    color: '#94a3b8',
  },
  timesBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timeLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 6,
  },
  breakdownBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
  },
  breakdownTotal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d97706',
    fontFamily: 'monospace',
  },
  noBreaksText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 8,
  },
  breakItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  breakItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  breakItemTime: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  sendReportBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendReportBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

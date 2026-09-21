import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api from '../lib/api';
import { formatDuration, formatTime, formatDate } from '../utils/workMetrics';

export default function AttendanceReportModal({
  visible,
  reportData,
  onClose,
}) {
  const [sending, setSending] = useState(false);

  if (!visible || !reportData) return null;

  const att = reportData.attendance || reportData;
  const summary = reportData.summary || {};
  const breaks = summary.breaks || att.breaks || [];

  const checkIn = summary.checkInTime || att.checkInTime;
  const checkOut = summary.checkOutTime || att.checkOutTime;

  const totalDurationMins =
    summary.totalDurationMinutes ??
    att.totalDurationMinutes ??
    (checkIn && checkOut
      ? Math.max(
          0,
          Math.floor(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000
          )
        )
      : 0);

  const totalBreakMins =
    summary.totalBreakMinutes ??
    att.totalBreakMinutes ??
    att.completedBreakMinutes ??
    0;

  const actualWorkMins =
    summary.actualWorkMinutes ??
    att.actualWorkMinutes ??
    Math.max(0, totalDurationMins - totalBreakMins);

  const handleSendReport = async () => {
    setSending(true);
    try {
      await api.post('/employee/attendance/send-report');
      Alert.alert('Report Sent', 'Your attendance report has been emailed to your manager.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to send report.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Celebration Header */}
            <View style={styles.headerBanner}>
              <View style={styles.checkBadge}>
                <Text style={styles.checkBadgeText}>✓</Text>
              </View>
              <Text style={styles.headerTitle}>Shift Completed</Text>
              <Text style={styles.headerSub}>
                {checkIn ? formatDate(checkIn) : 'Today'} · Verified Attendance Log
              </Text>
            </View>

            {/* 3 Metric Cards */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Total Duration</Text>
                <Text style={styles.metricValue}>
                  {formatDuration(totalDurationMins)}
                </Text>
                <Text style={styles.metricNote}>Gross Shift</Text>
              </View>

              <View style={[styles.metricTile, styles.tileAmber]}>
                <Text style={[styles.metricLabel, styles.textAmber]}>Total Breaks</Text>
                <Text style={[styles.metricValue, styles.textAmber]}>
                  {formatDuration(totalBreakMins)}
                </Text>
                <Text style={styles.metricNote}>
                  {breaks.length} break{breaks.length === 1 ? '' : 's'}
                </Text>
              </View>

              <View style={[styles.metricTile, styles.tileEmerald]}>
                <Text style={[styles.metricLabel, styles.textEmerald]}>Actual Work</Text>
                <Text style={[styles.metricValue, styles.textEmerald]}>
                  {formatDuration(actualWorkMins)}
                </Text>
                <Text style={styles.metricNote}>Net Productive</Text>
              </View>
            </View>

            {/* Inset Timestamps */}
            <View style={styles.timestampsCard}>
              <View style={styles.timeItemRow}>
                <Text style={styles.timeItemLabel}>Check-In Time:</Text>
                <Text style={styles.timeItemVal}>{formatTime(checkIn)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.timeItemRow}>
                <Text style={styles.timeItemLabel}>Check-Out Time:</Text>
                <Text style={styles.timeItemVal}>{formatTime(checkOut)}</Text>
              </View>
            </View>

            {/* Break Breakdown */}
            {breaks.length > 0 && (
              <View style={styles.breaksCard}>
                <Text style={styles.breaksTitle}>BREAKS BREAKDOWN</Text>
                {breaks.map((b, idx) => {
                  const bStart = b.startedAt ? formatTime(b.startedAt) : '—';
                  const bEnd = b.endedAt ? formatTime(b.endedAt) : '—';
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
                    <View key={b._id || idx} style={styles.breakRow}>
                      <Text style={styles.breakType}>
                        #{idx + 1} {b.type || 'Personal'} Break
                      </Text>
                      <Text style={styles.breakTimes}>
                        {bStart} – {bEnd} ({dur}m)
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={handleSendReport}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.sendBtnText}>✉️ Send Report to Manager</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Close & Return to Dashboard</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 10,
  },
  headerBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
  },
  checkBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkBadgeText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#064e3b',
  },
  headerSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 3,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricTile: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  tileAmber: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  tileEmerald: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
    fontFamily: 'monospace',
  },
  metricNote: {
    fontSize: 9,
    color: '#94a3b8',
  },
  textAmber: {
    color: '#d97706',
  },
  textEmerald: {
    color: '#059669',
  },
  timestampsCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
  },
  timeItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  timeItemLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  timeItemVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
  },
  breaksCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  breaksTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 6,
  },
  breakType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  breakTimes: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  sendBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
});

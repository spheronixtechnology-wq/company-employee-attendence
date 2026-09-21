import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useGeofence } from '../contexts/GeofenceContext';

export default function GeofenceAlertModal() {
  const {
    session,
    alertLevel,
    geofenceStatus,
    officeRadius,
    insideConfirmCount,
    graceSeconds,
    warningModalOpen,
    setWarningModalOpen,
    submitReason,
  } = useGeofence();

  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);

  if (!warningModalOpen || alertLevel === 0) {
    return null;
  }

  const formatGraceTime = (sec = 0) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(rem)}`;
  };

  const handleSubmitReason = async () => {
    if (!reasonText || !reasonText.trim()) {
      Alert.alert('Reason Required', 'Please enter a valid reason for leaving the office perimeter.');
      return;
    }

    setSubmitting(true);
    try {
      await submitReason(reasonText.trim());
      Alert.alert('Reason Recorded', 'Your manager has been notified of your out-of-bounds status.');
      setReasonText('');
      setShowReasonInput(false);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to submit reason.');
    } finally {
      setSubmitting(false);
    }
  };

  const isLevel5 = alertLevel === 5;
  const isReturning = geofenceStatus === 'RETURNING';

  const alertColors = {
    1: { badge: '#fef3c7', text: '#b45309', border: '#fde68a' },
    2: { badge: '#fed7aa', text: '#c2410c', border: '#fdba74' },
    3: { badge: '#ffedd5', text: '#ea580c', border: '#fb923c' },
    4: { badge: '#fee2e2', text: '#dc2626', border: '#f87171' },
    5: { badge: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
  }[alertLevel] || { badge: '#fef3c7', text: '#b45309', border: '#fde68a' };

  return (
    <Modal
      visible={warningModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isLevel5) setWarningModalOpen(false);
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderColor: alertColors.border }]}>
          {/* Top Alert Badge */}
          <View style={[styles.alertBadge, { backgroundColor: alertColors.badge }]}>
            <Text style={[styles.alertBadgeText, { color: alertColors.text }]}>
              {isLevel5 ? '🚨 CRITICAL GEOFENCE ALERT (LEVEL 5)' : `⚠️ GEOFENCE WARNING (LEVEL ${alertLevel})`}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.modalTitle}>
            {isReturning
              ? 'Returning to Office'
              : isLevel5
              ? 'Auto-Checkout Grace Period'
              : 'Outside Office Perimeter'}
          </Text>

          {/* Subtitle / Description */}
          <Text style={styles.modalDescription}>
            {isReturning ? (
              `Confirming your return to ${session?.officeName || 'the office'}. Please stay within the boundary.`
            ) : isLevel5 ? (
              `You have been outside ${session?.officeName || 'the office'} perimeter continuously. Your shift will automatically be checked out when the countdown finishes.`
            ) : (
              `You have moved beyond the authorized radius (${officeRadius || session?.radius || 100}m) of ${session?.officeName || 'your office'}. Current distance: ~${session?.distance || 0}m.`
            )}
          </Text>

          {/* Returning Progress Tracker */}
          {isReturning && (
            <View style={styles.returningBox}>
              <Text style={styles.returningText}>
                Confirming Return: {insideConfirmCount} / 3 verified samples
              </Text>
              <View style={styles.returningDotsRow}>
                {[1, 2, 3].map((step) => (
                  <View
                    key={step}
                    style={[
                      styles.dot,
                      insideConfirmCount >= step && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Level 5 Countdown Timer */}
          {isLevel5 && (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownSub}>TIME REMAINING BEFORE AUTO-CHECKOUT</Text>
              <Text style={styles.countdownValue}>{formatGraceTime(graceSeconds)}</Text>
              <Text style={styles.countdownNote}>
                Return inside the office boundary or submit an approved reason immediately.
              </Text>
            </View>
          )}

          {/* Reason Input Box */}
          {showReasonInput ? (
            <View style={styles.reasonForm}>
              <Text style={styles.reasonInputLabel}>Reason for Leaving Perimeter:</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="e.g. Client meeting at Cafe, field errand, lunch"
                placeholderTextColor="#94a3b8"
                value={reasonText}
                onChangeText={setReasonText}
                multiline
                numberOfLines={3}
              />
              <View style={styles.reasonActionsRow}>
                <TouchableOpacity
                  style={[styles.reasonActionBtn, styles.submitReasonBtn]}
                  onPress={handleSubmitReason}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.btnTextWhite}>Submit Reason</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.reasonActionBtn, styles.cancelReasonBtn]}
                  onPress={() => setShowReasonInput(false)}
                  disabled={submitting}
                >
                  <Text style={styles.btnTextSlate}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.reasonToggleBtn}
                onPress={() => setShowReasonInput(true)}
              >
                <Text style={styles.reasonToggleBtnText}>📝 Submit Out-of-Bounds Reason</Text>
              </TouchableOpacity>

              {!isLevel5 && (
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => setWarningModalOpen(false)}
                >
                  <Text style={styles.dismissBtnText}>I Am Returning to Office</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  alertBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  countdownBox: {
    width: '100%',
    backgroundColor: '#fff1f2',
    borderWidth: 1.5,
    borderColor: '#fecdd3',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownSub: {
    fontSize: 10,
    fontWeight: '800',
    color: '#be123c',
    letterSpacing: 0.6,
  },
  countdownValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#e11d48',
    fontFamily: 'monospace',
    marginVertical: 4,
  },
  countdownNote: {
    fontSize: 11,
    color: '#9f1239',
    textAlign: 'center',
    marginTop: 2,
  },
  returningBox: {
    width: '100%',
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  returningText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 8,
  },
  returningDotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#cbd5e1',
  },
  dotActive: {
    backgroundColor: '#10b981',
  },
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  reasonToggleBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reasonToggleBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  reasonForm: {
    width: '100%',
    marginTop: 8,
  },
  reasonInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 12,
  },
  reasonActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reasonActionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitReasonBtn: {
    backgroundColor: '#10b981',
  },
  cancelReasonBtn: {
    backgroundColor: '#e2e8f0',
  },
  btnTextWhite: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  btnTextSlate: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
});

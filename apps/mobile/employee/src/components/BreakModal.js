import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api from '../lib/api';
import { isLogSheetLocked } from '../utils/workMetrics';
import BreakTimer from './BreakTimer';

const BREAK_OPTIONS = [
  { id: 'Tea/Coffee', label: 'Tea / Coffee', desc: '10–15 min quick refresh', icon: '☕' },
  { id: 'Lunch', label: 'Lunch Break', desc: '1:00 PM – 2:00 PM window', icon: '🍱' },
  { id: 'Personal', label: 'Personal Break', desc: 'Urgent task or personal matter', icon: '👤' },
  { id: 'Short Break', label: 'Short Rest', desc: 'Screen rest / hydration', icon: '⏱️' },
];

export default function BreakModal({
  visible,
  onClose,
  activeBreak,
  checkInTime,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('Tea/Coffee');

  const isLocked = isLogSheetLocked(checkInTime);

  const handleStartBreak = async () => {
    if (isLocked) {
      Alert.alert(
        'Break Controls Locked',
        '⚠️ Break controls are locked after 8:00 PM IST.'
      );
      return;
    }

    setLoading(true);
    try {
      await api.post('/employee/break/start', { breakType: selectedType });
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to start break.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEndBreak = async () => {
    setLoading(true);
    try {
      await api.post('/employee/break/end');
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to end break.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {activeBreak ? (
            /* Active Break State */
            <View style={styles.activeBreakContainer}>
              <View style={styles.amberBadge}>
                <Text style={styles.amberBadgeText}>BREAK IN PROGRESS</Text>
              </View>

              <Text style={styles.activeBreakTitle}>
                {activeBreak.type || 'Break'} Ongoing
              </Text>
              <Text style={styles.activeBreakSub}>
                Timer started at{' '}
                {activeBreak.startedAt
                  ? new Date(activeBreak.startedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'just now'}
              </Text>

              <View style={styles.timerBox}>
                <BreakTimer startedAt={activeBreak.startedAt} />
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, styles.endBreakBtn]}
                onPress={handleEndBreak}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>Resume Work (End Break)</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelBtnText}>Keep Break Active</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Start New Break State */
            <View>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.modalTitle}>Take a Break</Text>
                  <Text style={styles.modalSub}>
                    Select your break category below
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {isLocked ? (
                <View style={styles.lockedBanner}>
                  <Text style={styles.lockedBannerText}>
                    ⚠️ Break controls are locked after 8:00 PM IST.
                  </Text>
                </View>
              ) : null}

              <View style={styles.optionsList}>
                {BREAK_OPTIONS.map((opt) => {
                  const isSelected = selectedType === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                      ]}
                      onPress={() => setSelectedType(opt.id)}
                      disabled={isLocked}
                    >
                      <Text style={styles.optionIcon}>{opt.icon}</Text>
                      <View style={styles.optionTextCol}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isSelected && styles.optionLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text style={styles.optionDesc}>{opt.desc}</Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.startBreakBtn,
                  isLocked && styles.btnDisabled,
                ]}
                onPress={handleStartBreak}
                disabled={loading || isLocked}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>Start Break</Text>
                )}
              </TouchableOpacity>
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: 'bold',
  },
  lockedBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  lockedBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },
  optionsList: {
    gap: 10,
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  optionCardSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionTextCol: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  optionLabelSelected: {
    color: '#4338ca',
  },
  optionDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#6366f1',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366f1',
  },
  actionBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBreakBtn: {
    backgroundColor: '#f59e0b',
  },
  endBreakBtn: {
    backgroundColor: '#10b981',
    marginTop: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  activeBreakContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  amberBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  amberBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 0.8,
  },
  activeBreakTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  activeBreakSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  timerBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginVertical: 18,
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
});

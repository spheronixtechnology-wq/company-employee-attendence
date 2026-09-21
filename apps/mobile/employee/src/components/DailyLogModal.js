import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import api from '../lib/api';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export default function DailyLogModal({ visible, onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/plain',
          'text/csv',
          'application/rtf',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (file.size && file.size > MAX_FILE_SIZE) {
        Alert.alert('File Too Large', 'Please select a document under 2MB.');
        return;
      }

      setSelectedFile(file);
    } catch (err) {
      console.error('File pick error:', err);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      Alert.alert('Document Required', 'Please select a daily work document (under 2MB).');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('document', {
        uri: selectedFile.uri,
        name: selectedFile.name || 'daily_log.pdf',
        type: selectedFile.mimeType || 'application/pdf',
      });

      const res = await api.post('/employee/daily-log/me', formData);

      Alert.alert('Log Submitted', 'Daily work log document submitted successfully!');
      setSelectedFile(null);
      if (onSuccess) onSuccess(res.data?.data?.log);
      if (onClose) onClose();
    } catch (err) {
      console.error('Daily log submission error:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to upload daily log.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Upload Daily Work Document</Text>
              <Text style={styles.subtitle}>Mandatory compliance before shift check-out</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Sparkle banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>✨</Text>
            <Text style={styles.infoText}>
              Hours worked will be calculated automatically based on your active shift duration and breaks.
            </Text>
          </View>

          {/* File selector or Selected file */}
          {selectedFile ? (
            <View style={styles.fileBox}>
              <Text style={styles.fileIcon}>📄</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <Text style={styles.fileSize}>{formatFileSize(selectedFile.size)}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.pickerBox} onPress={handlePick}>
              <Text style={styles.pickerIcon}>📁</Text>
              <Text style={styles.pickerTitle}>Select Work Document</Text>
              <Text style={styles.pickerSub}>PDF, Word, Excel, CSV, TXT up to 2MB</Text>
            </TouchableOpacity>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, (!selectedFile || submitting) && styles.submitBtnDisabled]}
              disabled={!selectedFile || submitting}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Daily Log</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ede9fe',
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: '#6d28d9',
    lineHeight: 15,
  },
  pickerBox: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  pickerIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  pickerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  fileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  fileIcon: {
    fontSize: 22,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  fileSize: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 1,
  },
  removeBtn: {
    padding: 6,
  },
  removeBtnText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

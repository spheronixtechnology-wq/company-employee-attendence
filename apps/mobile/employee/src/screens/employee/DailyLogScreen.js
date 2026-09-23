import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, Home, ChevronLeft } from 'lucide-react-native';
import api from '../../lib/api';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export default function DailyLogScreen({ onBack }) {
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [todayLog, setTodayLog] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showWorkDetails, setShowWorkDetails] = useState(false);

  // Optional work metadata matching web DailyLogFields
  const [taskTitle, setTaskTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [githubLink, setGithubLink] = useState('');
  const [description, setDescription] = useState('');

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get('/employee/daily-log/me');
      if (res.data?.success) {
        const fetchedLogs = res.data.data.logs || [];
        setLogs(fetchedLogs);
        setStreak(res.data.data.streak || 0);

        const today = new Date().toISOString().split('T')[0];
        const todayEntry = fetchedLogs.find((l) => l.logDate === today);
        setTodayLog(todayEntry || null);
      }
    } catch (err) {
      console.error('Failed to fetch daily logs:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to load daily logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handlePickDocument = async () => {
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

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      if (file.size && file.size > MAX_FILE_SIZE) {
        Alert.alert(
          'File Too Large',
          `The selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Please choose a file under 2 MB.`
        );
        return;
      }

      const ext = '.' + (file.name || '').split('.').pop().toLowerCase();
      const ALLOWED = ['.doc', '.docx', '.pdf', '.txt', '.rtf', '.odt', '.xlsx', '.xls', '.csv'];
      if (!ALLOWED.includes(ext)) {
        Alert.alert('Invalid Format', `Allowed formats: ${ALLOWED.join(', ')}`);
        return;
      }

      setSelectedFile(file);
    } catch (err) {
      console.error('Document picker error:', err);
      Alert.alert('Selection Error', 'Failed to select document.');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      Alert.alert('No Document Selected', 'Please select a daily work document (up to 2MB) before submitting.');
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

      if (taskTitle.trim()) formData.append('taskTitle', taskTitle.trim());
      if (projectName.trim()) formData.append('projectName', projectName.trim());
      if (githubLink.trim()) formData.append('githubLink', githubLink.trim());
      if (description.trim()) formData.append('description', description.trim());

      await api.post('/employee/daily-log/me', formData);

      Alert.alert('Success', 'Daily work log document submitted successfully!');
      setSelectedFile(null);
      setTaskTitle('');
      setProjectName('');
      setGithubLink('');
      setDescription('');
      fetchLogs(true);
    } catch (err) {
      console.error('Daily log submission error:', err);
      Alert.alert('Submission Error', err.response?.data?.message || 'Failed to submit daily log document.');
    } finally {
      setSubmitting(false);
    }
  };

  // Streak milestone calculations
  const streakMilestones = [7, 14, 30];
  const nextMilestone = streakMilestones.find((m) => m > streak) || 30;
  const streakPct = Math.min(100, Math.round((streak / nextMilestone) * 100));

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Daily Log Compliance...</Text>
      </View>
    );
  }

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
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.homeCircleBtn}
              activeOpacity={0.7}
              accessibilityLabel="Home Dashboard"
            >
              <Home size={16} color="#0284c7" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Daily Work Log</Text>
          <Text style={styles.headerSubtitle}>Mandatory shift compliance & document upload</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs()} />}
      >
        {/* Streak & Milestone Card */}
        <View style={styles.streakCard}>
          <View style={styles.streakCardHeader}>
            <View style={styles.streakFlameContainer}>
              <Text style={styles.streakFlame}>🔥</Text>
              <View>
                <Text style={styles.streakNumber}>{streak}</Text>
                <Text style={styles.streakSub}>DAY STREAK</Text>
              </View>
            </View>

            <View style={styles.milestoneBadge}>
              <Text style={styles.milestoneBadgeText}>Target: {nextMilestone} Days</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${streakPct}%` }]} />
          </View>
          <Text style={styles.milestoneRemainingText}>
            {nextMilestone - streak > 0
              ? `${nextMilestone - streak} more days to reach the ${nextMilestone}-day milestone`
              : 'Milestone reached! Outstanding consistency!'}
          </Text>
        </View>

        {/* Today's Submission Status */}
        {todayLog ? (
          <View style={styles.submittedCard}>
            <View style={styles.submittedHeader}>
              <View style={styles.successIconBadge}>
                <Text style={{ fontSize: 16 }}>✓</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.submittedTitle}>Today's Log Submitted</Text>
                <Text style={styles.submittedSub}>
                  {todayLog.hoursSpent || '0'}h work duration logged
                </Text>
              </View>
              <View style={styles.submittedPill}>
                <Text style={styles.submittedPillText}>Verified</Text>
              </View>
            </View>

            <View style={styles.docDetailsBox}>
              <Text style={styles.docIcon}>📄</Text>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.docName} numberOfLines={1}>
                  {todayLog.documentName || todayLog.taskTitle || 'Daily Work Document'}
                </Text>
                <Text style={styles.docMeta}>
                  {todayLog.documentSize ? `${formatFileSize(todayLog.documentSize)} • ` : ''}
                  Submitted {todayLog.submittedAt ? new Date(todayLog.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.uploadCard}>
            <Text style={styles.uploadCardTitle}>Upload Today's Work Document</Text>
            <Text style={styles.uploadCardSub}>
              Attach your daily work report file (.doc, .docx, .pdf, .xlsx, or .txt) within 2MB size.
            </Text>

            {/* Shift duration auto-calc banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerIcon}>✨</Text>
              <Text style={styles.infoBannerText}>
                Work hours will be calculated automatically based on your active shift duration and breaks.
              </Text>
            </View>

            {/* Selected File or Picker Button */}
            {selectedFile ? (
              <View style={styles.selectedFileBox}>
                <Text style={styles.selectedFileIcon}>📎</Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.selectedFileName} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={styles.selectedFileSize}>
                    {formatFileSize(selectedFile.size)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeFileBtn}
                  onPress={() => setSelectedFile(null)}
                >
                  <Text style={styles.removeFileBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pickerArea}
                onPress={handlePickDocument}
              >
                <Text style={styles.pickerIcon}>📁</Text>
                <Text style={styles.pickerTitle}>Choose Document</Text>
                <Text style={styles.pickerSub}>PDF, Word, Excel, CSV, TXT up to 2MB</Text>
              </TouchableOpacity>
            )}

            {/* Optional Task Details matching web DailyLogFields */}
            <TouchableOpacity
              style={styles.detailsToggleBtn}
              activeOpacity={0.7}
              onPress={() => setShowWorkDetails((prev) => !prev)}
            >
              <Text style={styles.detailsToggleText}>
                {showWorkDetails ? '▲ Hide Optional Details' : '▼ Add Work Details (Optional)'}
              </Text>
            </TouchableOpacity>

            {showWorkDetails && (
              <View style={styles.detailsCard}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Task Title</Text>
                  <TextInput
                    style={styles.textInput}
                    value={taskTitle}
                    onChangeText={setTaskTitle}
                    placeholder="e.g. Completed feature API integration & tests"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Project Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={projectName}
                    onChangeText={setProjectName}
                    placeholder="e.g. Employee Mobile Attendance"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>GitHub PR / Repository Link</Text>
                  <TextInput
                    style={styles.textInput}
                    value={githubLink}
                    onChangeText={setGithubLink}
                    placeholder="https://github.com/..."
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Brief Description</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Summary of today's deliverables..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!selectedFile || submitting) && styles.submitButtonDisabled,
              ]}
              disabled={!selectedFile || submitting}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Daily Log</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Log History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Previous Logs</Text>
          {logs.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No past logs found.</Text>
            </View>
          ) : (
            logs.slice(0, 10).map((log) => (
              <View key={log._id} style={styles.historyCard}>
                <View style={styles.historyCardDateCol}>
                  <Text style={styles.historyDay}>{log.logDate?.split('-')[2] || '·'}</Text>
                  <Text style={styles.historyMonth}>
                    {log.logDate ? new Date(log.logDate).toLocaleString('default', { month: 'short' }) : ''}
                  </Text>
                </View>

                <View style={styles.historyCardInfoCol}>
                  <Text style={styles.historyDocName} numberOfLines={1}>
                    {log.documentName || log.taskTitle || 'Work Document'}
                  </Text>
                  <Text style={styles.historyDetails}>
                    {log.hoursSpent}h logged • {formatFileSize(log.documentSize)}
                  </Text>
                </View>

                <View style={styles.historyCheckBadge}>
                  <Text style={styles.historyCheckText}>✓</Text>
                </View>
              </View>
            ))
          )}
        </View>

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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
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
  homeCircleBtn: {
    width: 32,
    height: 32,
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
    paddingBottom: 40,
  },
  streakCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fef3c7',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  streakCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  streakFlameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakFlame: {
    fontSize: 28,
    marginRight: 8,
  },
  streakNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#b45309',
    fontVariant: ['tabular-nums'],
  },
  streakSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#d97706',
    letterSpacing: 0.5,
  },
  milestoneBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  milestoneBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#fde68a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 3,
  },
  milestoneRemainingText: {
    fontSize: 10,
    color: '#92400e',
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  submittedCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    marginBottom: 16,
  },
  submittedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  successIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  submittedSub: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '600',
  },
  submittedPill: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  submittedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },
  docDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  docIcon: {
    fontSize: 22,
  },
  docName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  docMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  uploadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  uploadCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  uploadCardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ede9fe',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  infoBannerIcon: {
    fontSize: 14,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11.5,
    color: '#6d28d9',
    fontWeight: '500',
    lineHeight: 16,
  },
  detailsToggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailsToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366f1',
  },
  pickerArea: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginBottom: 14,
  },
  pickerIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  pickerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  selectedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  selectedFileIcon: {
    fontSize: 20,
  },
  selectedFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  selectedFileSize: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 1,
  },
  removeFileBtn: {
    padding: 6,
  },
  removeFileBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ef4444',
  },
  submitButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  historySection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  emptyHistory: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  historyCardDateCol: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    marginRight: 10,
  },
  historyDay: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  historyMonth: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  historyCardInfoCol: {
    flex: 1,
  },
  historyDocName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  historyDetails: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  historyCheckBadge: {
    backgroundColor: '#dcfce7',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCheckText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },
  detailsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailsCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
  },
  fieldGroup: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  textArea: {
    height: 55,
    textAlignVertical: 'top',
  },
});

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../lib/api';
import { getDeviceInfo } from '../../lib/device';

const PRESET_REASONS = [
  'Bought a new phone',
  'Old phone is damaged',
  'Old phone lost or stolen',
  'Device replacement',
  'Other reason',
];

export default function LoginScreen({ onLoginSuccess }) {
  const { login } = useAuth();
  const { socket } = useSocket();

  // Mode: 'login' | 'mismatch' | 'pending' | 'approved'
  const [viewMode, setViewMode] = useState('login');

  const [selectedRole, setSelectedRole] = useState('employee');
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Device mismatch state
  const [mismatchData, setMismatchData] = useState(null);
  const [selectedReason, setSelectedReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Pending approval state
  const [pendingReqId, setPendingReqId] = useState(null);
  const [rejectionNote, setRejectionNote] = useState(null);

  // MFA State
  const [mfaData, setMfaData] = useState(null);
  const [otp, setOtp] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const { verifyMfaLogin } = useAuth();

  // ── Guest Socket: Listen for Real-Time Manager Approval ───────────────────
  useEffect(() => {
    if (!socket || viewMode !== 'pending' || !pendingReqId) return;

    console.log('⚡ [Login Guest Socket] Joining room for req:', pendingReqId);
    socket.emit('join:device_request', pendingReqId);

    const onResolved = (data) => {
      console.log('⚡ [Login Guest Socket] Device request resolved:', data);
      if (data?.action === 'approve') {
        setViewMode('approved');
      } else if (data?.action === 'reject') {
        setRejectionNote(data?.decisionNote || 'Request was declined by manager.');
      }
    };

    socket.on('device:request_resolved', onResolved);

    return () => {
      socket.off('device:request_resolved', onResolved);
    };
  }, [socket, viewMode, pendingReqId]);

  // ── Handle Standard Login ──────────────────────────────────────────────────
  const handleLoginSubmit = async () => {
    if (!form.email.trim() || !form.password) {
      setError('Please enter both email and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const devInfo = await getDeviceInfo();
      const loginResult = await login(form.email, form.password, {
        deviceFingerprint: devInfo.fingerprint,
        deviceLabel: devInfo.deviceLabel,
        expectedRole: selectedRole,
      });

      // Handle Manager MFA Challenge
      if (loginResult && loginResult.mfaRequired) {
        setMfaData(loginResult);
        setViewMode('mfa');
        return; // Don't call onLoginSuccess yet
      }

      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      if (err.isRoleMismatch) {
        setError(err.message);
      } else if (err.isDeviceMismatch || err.response?.status === 403) {
        setMismatchData(err.mismatchData || err.response?.data?.data);
        setViewMode('mismatch');
      } else {
        setError(err.userMessage || 'Login failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Handle MFA Verification ────────────────────────────────────────────────
  const handleMfaVerify = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }
    setError('');
    setVerifyingMfa(true);

    try {
      await verifyMfaLogin(mfaData.tempToken, otp, { expectedRole: selectedRole });
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      setError(err.userMessage || 'Invalid OTP. Please try again.');
    } finally {
      setVerifyingMfa(false);
    }
  };

  // ── Handle Device Replacement Request Submission ───────────────────────────
  const handleDeviceRequestSubmit = async () => {
    setError('');
    setSubmittingRequest(true);

    try {
      const devInfo = await getDeviceInfo();
      const finalReason = selectedReason === 'Other reason' && customReason.trim()
        ? `Other: ${customReason.trim()}`
        : selectedReason;

      const res = await api.post('/auth/device-access-request', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        reason: finalReason,
        requestedDeviceLabel: devInfo.deviceLabel,
        deviceFingerprint: devInfo.fingerprint,
      });

      const reqId = res.data?.data?.request?._id;
      setPendingReqId(reqId);
      setViewMode('pending');
    } catch (err) {
      setError(err.userMessage || 'Failed to submit device access request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // ── Auto-Sign In Once Manager Approves ─────────────────────────────────────
  const handleApprovedContinue = () => {
    setViewMode('login');
    handleLoginSubmit();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Brand Header */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.appTitle}>Spheronix Employee</Text>
            <Text style={styles.appSubtitle}>Attendance & Workday Portal</Text>
          </View>

          {/* ═══════════════════════════════════════════════════════════════════
              MODE 1: STANDARD LOGIN
             ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'login' && (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Sign In to Account</Text>
              <Text style={styles.cardDesc}>Enter your employee credentials to continue.</Text>

              {error ? (
                <View style={styles.errorAlert}>
                  <Text style={styles.errorAlertText}>{error}</Text>
                </View>
              ) : null}

              {/* Role Selector */}
              <View style={styles.roleSelectorContainer}>
                <TouchableOpacity
                  style={[styles.roleTab, selectedRole === 'employee' && styles.roleTabActive]}
                  onPress={() => setSelectedRole('employee')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleTabText, selectedRole === 'employee' && styles.roleTabTextActive]}>Employee</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleTab, selectedRole === 'manager' && styles.roleTabActive]}
                  onPress={() => setSelectedRole('manager')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleTabText, selectedRole === 'manager' && styles.roleTabTextActive]}>Manager</Text>
                </TouchableOpacity>
              </View>

              {/* Email Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@spheronixtechnology.in"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={form.email}
                  onChangeText={(val) => setForm({ ...form, email: val })}
                  editable={!loading}
                />
              </View>

              {/* Password Field */}
              <View style={styles.inputGroup}>
                <View style={styles.rowBetween}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={form.password}
                  onChangeText={(val) => setForm({ ...form, password: val })}
                  editable={!loading}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleLoginSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.deviceNotice}>
                🔒 This device will be automatically linked to your account for attendance tracking.
              </Text>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MODE 2: DEVICE MISMATCH (HTTP 403 INTERCEPTED)
             ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'mismatch' && (
            <View style={styles.card}>
              <View style={styles.warningIconCircle}>
                <Text style={styles.warningIconText}>📱</Text>
              </View>
              <Text style={[styles.cardHeading, { textAlign: 'center' }]}>Device Mismatch</Text>
              <Text style={[styles.cardDesc, { textAlign: 'center', marginBottom: 16 }]}>
                This account is already registered on another device. To mark attendance from this phone, submit a device replacement request.
              </Text>

              {error ? (
                <View style={styles.errorAlert}>
                  <Text style={styles.errorAlertText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.inputLabel}>Select Reason for Replacement *</Text>
              <View style={styles.presetList}>
                {PRESET_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.presetOption, isSelected && styles.presetOptionActive]}
                      onPress={() => setSelectedReason(reason)}
                    >
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]} />
                      <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedReason === 'Other reason' && (
                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                    placeholder="Describe reason for switching devices..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    value={customReason}
                    onChangeText={setCustomReason}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, submittingRequest && styles.disabledButton]}
                onPress={handleDeviceRequestSubmit}
                disabled={submittingRequest}
              >
                {submittingRequest ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Submit Request to Manager</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setViewMode('login')}
              >
                <Text style={styles.cancelButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MODE 3: PENDING MANAGER APPROVAL (Awaiting Socket Event)
             ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'pending' && (
            <View style={styles.card}>
              <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 16 }} />
              <Text style={[styles.cardHeading, { textAlign: 'center' }]}>Awaiting Manager Approval</Text>
              <Text style={[styles.cardDesc, { textAlign: 'center', marginVertical: 12 }]}>
                Your device access request has been delivered to your manager. This screen will automatically update as soon as it is approved.
              </Text>

              {rejectionNote && (
                <View style={styles.errorAlert}>
                  <Text style={styles.errorAlertText}>❌ Request Declined: {rejectionNote}</Text>
                </View>
              )}

              <View style={styles.liveNoticePill}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.liveNoticeText}>Live connection active. Keep this screen open.</Text>
              </View>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setViewMode('login')}
              >
                <Text style={styles.cancelButtonText}>Cancel and Return to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MODE 4: APPROVED! AUTO-LOGIN TRIGGER
             ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'approved' && (
            <View style={styles.card}>
              <View style={styles.successIconCircle}>
                <Text style={styles.successIconText}>🎉</Text>
              </View>
              <Text style={[styles.cardHeading, { textAlign: 'center' }]}>Device Approved!</Text>
              <Text style={[styles.cardDesc, { textAlign: 'center', marginVertical: 12 }]}>
                Your manager approved this device. Tap continue below to finalize signing in.
              </Text>

              <TouchableOpacity
                style={styles.successButton}
                onPress={handleApprovedContinue}
              >
                <Text style={styles.primaryButtonText}>Continue to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MODE 5: MANAGER MFA VERIFICATION
             ═══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'mfa' && (
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Two-Factor Authentication</Text>
              <Text style={styles.cardDesc}>
                {mfaData?.mfaEnrolled 
                  ? 'Enter the 6-digit code from your Authenticator app.' 
                  : 'Scan the QR code below with your Authenticator app, then enter the 6-digit code to activate MFA.'}
              </Text>

              {error ? (
                <View style={styles.errorAlert}>
                  <Text style={styles.errorAlertText}>{error}</Text>
                </View>
              ) : null}

              {/* Show QR Code for first-time setup */}
              {!mfaData?.mfaEnrolled && mfaData?.qrCode && (
                <View style={{ alignItems: 'center', marginVertical: 16 }}>
                  <Image
                    source={{ uri: mfaData.qrCode }}
                    style={{ width: 160, height: 160, borderRadius: 8 }}
                  />
                  <Text style={{ marginTop: 12, fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                    Or enter setup key manually:
                  </Text>
                  <View style={{ backgroundColor: '#f1f5f9', padding: 8, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: '#334155', letterSpacing: 1 }}>
                      {mfaData.secret}
                    </Text>
                  </View>
                </View>
              )}

              {/* OTP Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <TextInput
                  style={[styles.input, { fontSize: 18, letterSpacing: 4, textAlign: 'center' }]}
                  placeholder="------"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  editable={!verifyingMfa}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, verifyingMfa && styles.disabledButton]}
                onPress={handleMfaVerify}
                disabled={verifyingMfa}
              >
                {verifyingMfa ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify & Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setViewMode('login'); setOtp(''); }}
              >
                <Text style={styles.cancelButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 140,
    height: 60,
    marginBottom: 10,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 20,
  },
  roleSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  roleTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  roleTabTextActive: {
    color: '#0f172a',
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  disabledButton: {
    opacity: 0.6,
  },
  deviceNotice: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
  errorAlert: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorAlertText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  warningIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fef3c7',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  warningIconText: {
    fontSize: 28,
  },
  presetList: {
    marginBottom: 16,
  },
  presetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  presetOptionActive: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 10,
  },
  radioCircleActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0284c7',
  },
  presetText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  presetTextActive: {
    color: '#0369a1',
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  liveNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginVertical: 12,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  liveNoticeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dcfce7',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successIconText: {
    fontSize: 28,
  },
  successButton: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
});

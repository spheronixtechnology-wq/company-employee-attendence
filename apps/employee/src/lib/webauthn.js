import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import api from './api';

/**
 * Check if WebAuthn platform authenticator (fingerprint, Face ID, Windows Hello)
 * is available on this browser/device.
 */
export const isBiometricSupported = async () => {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;

  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch (err) {
    console.warn('isUserVerifyingPlatformAuthenticatorAvailable check error:', err);
    return false;
  }
};

/**
 * Formats WebAuthn DOMExceptions and network errors into clear user-facing messages.
 */
export const formatWebAuthnError = (err) => {
  console.error('[WebAuthn Error]:', err);
  if (!err) return 'Verification operation failed.';

  const name = err.name || '';
  const msg = (err.message || '').toLowerCase();

  if (name === 'NotAllowedError' || msg.includes('not allowed') || msg.includes('timed out') || msg.includes('canceled') || msg.includes('cancelled')) {
    return 'Verification prompt was closed or timed out. If your fingerprint or face is unreadable, you can enter your device screen PIN/pattern on the prompt.';
  }
  if (name === 'SecurityError' || msg.includes('relying party id') || msg.includes('origin')) {
    return 'Security domain mismatch: WebAuthn requires accessing via an authorized domain name or localhost (raw IP addresses are blocked by browser security).';
  }
  if (name === 'InvalidStateError' || msg.includes('already registered')) {
    return 'This device authenticator is already enrolled.';
  }
  if (name === 'NotSupportedError' || msg.includes('not supported')) {
    return 'Biometric platform authenticator is not supported on this browser. Please use Chrome on Android or Safari on iOS with a screen lock enabled.';
  }
  if (name === 'AbortError') {
    return 'Verification request was aborted.';
  }

  return err.response?.data?.message || err.message || 'Biometric operation failed.';
};

/**
 * Check biometric enrollment status for current user on active device.
 */
export const getBiometricStatus = async () => {
  const res = await api.get('/employee/biometric/status');
  return res.data?.data || {};
};

/**
 * Execute WebAuthn Enrollment Ceremony ("Enable Biometric Attendance")
 */
export const enrollBiometric = async () => {
  // 1. Fetch registration options from server
  const optionsRes = await api.post('/employee/biometric/enroll/options');
  const options = optionsRes.data?.data;

  if (!options) {
    throw new Error('Failed to obtain registration options from server.');
  }

  // 2. Invoke native platform authenticator (Fingerprint, Face ID, PIN)
  const registrationResult = await startRegistration(options);

  // 3. Send authenticator attestation response to server for verification
  const verifyRes = await api.post('/employee/biometric/enroll/verify', {
    response: registrationResult,
  });

  return verifyRes.data?.data;
};

/**
 * Execute WebAuthn Authentication Ceremony ("Verify Biometric & Check In")
 * Returns { biometricToken, expiresAt } on success.
 */
export const authenticateBiometric = async () => {
  // 1. Fetch authentication options from server
  const optionsRes = await api.post('/employee/biometric/auth/options');
  const options = optionsRes.data?.data;

  if (!options) {
    throw new Error('Failed to obtain authentication options from server.');
  }

  // 2. Invoke native platform authenticator
  const authenticationResult = await startAuthentication(options);

  // 3. Send assertion response to server for verification
  const verifyRes = await api.post('/employee/biometric/auth/verify', {
    response: authenticationResult,
  });

  return verifyRes.data?.data; // Contains { biometricToken, expiresAt }
};

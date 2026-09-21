import * as LocalAuthentication from 'expo-local-authentication';
import api from './api';
import { getDeviceSignals } from './device';

/**
 * Checks if hardware biometric sensors (fingerprint/face) are available and enrolled
 */
export async function checkBiometricAvailability() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    return {
      supported: hasHardware,
      enrolled: isEnrolled,
      types: supportedTypes, // 1: FINGERPRINT, 2: FACIAL_RECOGNITION, 3: IRIS
    };
  } catch (err) {
    return {
      supported: false,
      enrolled: false,
      types: [],
    };
  }
}

/**
 * Prompts native Android BiometricPrompt (Fingerprint / Face / Device PIN fallback)
 * and exchanges the hardware confirmation with the server for a signed single-use biometricToken.
 */
export async function authenticateAndGetBiometricToken() {
  const { supported, enrolled } = await checkBiometricAvailability();
  if (!supported || !enrolled) {
    throw new Error('Biometric sensor is not configured or no fingerprints/face are enrolled on this device.');
  }

  const authResult = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Spheronix Attendance Biometric Verification',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use Device PIN / Pattern',
    disableDeviceFallback: false,
  });

  if (!authResult.success) {
    if (authResult.error === 'user_cancel' || authResult.error === 'system_cancel') {
      const err = new Error('Biometric authentication was cancelled.');
      err.code = 'AUTH_CANCELLED';
      throw err;
    }
    const err = new Error(authResult.warning || 'Biometric authentication failed.');
    err.code = 'AUTH_FAILED';
    throw err;
  }

  // User confirmed biometrically! Obtain single-use server token bound to device
  const device = await getDeviceSignals();
  const res = await api.post('/employee/biometric/mobile-verify', {
    deviceFingerprint: device.deviceFingerprint,
  });

  if (!res.data?.success || !res.data?.data?.biometricToken) {
    throw new Error(res.data?.message || 'Server rejected biometric verification.');
  }

  return {
    biometricToken: res.data.data.biometricToken,
    expiresAt: res.data.data.expiresAt,
  };
}

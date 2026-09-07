import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise = null;

/**
 * Generates a fallback device ID if browser blocks canvas/webgl fingerprinting
 */
const getFallbackId = () => {
  try {
    let id = localStorage.getItem('app_device_fallback_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('app_device_fallback_id', id);
    }
    return id;
  } catch {
    return 'dev_fallback_guest';
  }
};

/**
 * Returns the cached device fingerprint synchronously, or null if not yet computed.
 */
export const getCachedDeviceFingerprint = () => {
  try {
    return localStorage.getItem('deviceFingerprint') || null;
  } catch {
    return null;
  }
};

/**
 * Computes or retrieves the persistent hardware/browser fingerprint for this device.
 * Stores result in localStorage('deviceFingerprint') for instant retrieval.
 * 
 * @returns {Promise<string>} unique visitor identifier
 */
export const getDeviceFingerprint = async () => {
  // Check cached fingerprint first for fastest startup
  const cached = getCachedDeviceFingerprint();

  try {
    if (!fpPromise) {
      fpPromise = FingerprintJS.load();
    }
    const fp = await fpPromise;
    const result = await fp.get();
    const visitorId = result.visitorId;

    if (visitorId) {
      try {
        localStorage.setItem('deviceFingerprint', visitorId);
      } catch {}
      return visitorId;
    }
  } catch (err) {
    console.warn('[FingerprintJS] Failed to get hardware fingerprint, using fallback ID:', err.message);
  }

  // Fallback if FingerprintJS failed or was blocked
  const fallback = cached || getFallbackId();
  try {
    localStorage.setItem('deviceFingerprint', fallback);
  } catch {}
  return fallback;
};

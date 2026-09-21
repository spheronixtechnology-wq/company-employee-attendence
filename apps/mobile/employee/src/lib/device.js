import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { getDeviceFingerprint, setDeviceFingerprint } from './storage';

/**
 * Generates a persistent pseudo-random UUID for this installation if not present.
 */
const generateFallbackId = () => {
  return 'hw_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
};

/**
 * Obtains the device hardware context signals.
 * 
 * NOTE: Device Information !== Device Identity.
 * The server-managed `deviceToken` remains the sole authoritative binding mechanism.
 * These native hardware fields serve exclusively as supporting context for audit and manager identification.
 */
export const getDeviceInfo = async () => {
  const brand = Device.brand || 'Android';
  const model = Device.modelName || Device.designName || Device.productName || 'Device';
  const os = Device.osName || 'Android';
  const osVersion = Device.osVersion || '';
  const appVersion = Application.nativeApplicationVersion || '1.0.0';

  // Capitalize brand name nicely (e.g. "samsung" -> "Samsung")
  const cleanBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
  const cleanModel = model.replace(new RegExp(`^${cleanBrand}\\s*`, 'i'), '').trim();
  const fullModel = cleanModel ? `${cleanBrand} ${cleanModel}` : cleanBrand;

  const deviceLabel = osVersion 
    ? `${fullModel} · ${os} ${osVersion}`
    : `${fullModel} · ${os}`;

  // Retrieve or compute persistent installation fingerprint
  let fingerprint = await getDeviceFingerprint();
  if (!fingerprint) {
    // If AndroidId is available (API 26+), combine with installation seed
    const androidId = Application.getAndroidId ? Application.getAndroidId() : null;
    fingerprint = androidId ? `aid_${androidId}` : generateFallbackId();
    await setDeviceFingerprint(fingerprint);
  }

    return {
    brand: cleanBrand,
    model: fullModel,
    os,
    osVersion,
    appVersion,
    deviceLabel: deviceLabel.slice(0, 80),
    fingerprint,
    deviceFingerprint: fingerprint,
    deviceModel: fullModel,
    isDevice: Device.isDevice,
  };
};

export { getDeviceFingerprint } from './storage';

export const getDeviceSignals = async () => {
  const info = await getDeviceInfo();
  return info;
};

export const getDeviceContext = getDeviceSignals;


import * as SecureStore from 'expo-secure-store';

const memoryStore = new Map();

/**
 * Persists an item securely using Android KeyStore-backed EncryptedSharedPreferences.
 */
export const setSecureItem = async (key, value) => {
  try {
    const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
    await SecureStore.setItemAsync(key, stringVal);
    memoryStore.set(key, stringVal);
  } catch (error) {
    console.warn(`[SecureStore] Failed to write key "${key}":`, error.message);
    memoryStore.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
};

/**
 * Retrieves an item securely from Android KeyStore-backed EncryptedSharedPreferences.
 */
export const getSecureItem = async (key) => {
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val !== null && val !== undefined) {
      memoryStore.set(key, val);
      return val;
    }
  } catch (error) {
    console.warn(`[SecureStore] Failed to read key "${key}":`, error.message);
  }
  return memoryStore.get(key) || null;
};

/**
 * Deletes an item securely.
 */
export const deleteSecureItem = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.warn(`[SecureStore] Failed to delete key "${key}":`, error.message);
  }
  memoryStore.delete(key);
};

// ── Specific Helper Keys ───────────────────────────────────────────────────────
const KEYS = {
  AUTH_TOKEN: 'auth_jwt_token',
  DEVICE_TOKEN: 'device_binding_token',
  DEVICE_FINGERPRINT: 'device_hardware_fingerprint',
  USER_SESSION: 'cached_user_session',
};

export const getAuthToken = () => getSecureItem(KEYS.AUTH_TOKEN);
export const setAuthToken = (token) => setSecureItem(KEYS.AUTH_TOKEN, token);
export const clearAuthToken = () => deleteSecureItem(KEYS.AUTH_TOKEN);

export const getDeviceToken = () => getSecureItem(KEYS.DEVICE_TOKEN);
export const setDeviceToken = (token) => setSecureItem(KEYS.DEVICE_TOKEN, token);
export const clearDeviceToken = () => deleteSecureItem(KEYS.DEVICE_TOKEN);

export const getDeviceFingerprint = () => getSecureItem(KEYS.DEVICE_FINGERPRINT);
export const setDeviceFingerprint = (fp) => setSecureItem(KEYS.DEVICE_FINGERPRINT, fp);

export const getUserSession = async () => {
  const data = await getSecureItem(KEYS.USER_SESSION);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
export const setUserSession = (user) => setSecureItem(KEYS.USER_SESSION, user);
export const clearUserSession = () => deleteSecureItem(KEYS.USER_SESSION);

export const clearAllSessionData = async () => {
  await Promise.all([
    clearAuthToken(),
    clearUserSession(),
  ]);
};

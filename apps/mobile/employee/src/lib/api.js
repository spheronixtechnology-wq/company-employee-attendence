import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, getDeviceToken, clearAllSessionData } from './storage';
import { getDeviceInfo } from './device';

/**
 * Derives the base API URL from environment configuration.
 * Automatically falls back to current Metro packager LAN IP on physical devices.
 */
export const getBaseUrl = () => {
  // Safe check for process.env in case babel-preset-expo is missing or misconfigured
  const envUrl = (typeof process !== 'undefined' && process.env) 
    ? process.env.EXPO_PUBLIC_API_URL 
    : undefined;
    
  if (envUrl && !envUrl.includes('10.0.2.2') && !envUrl.includes('localhost')) {
    return envUrl;
  }
  // If running in Expo Go or dev client on physical phone, resolve host computer LAN IP
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:5000/api`;
  }
  return envUrl || 'http://10.0.2.2:5000/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-portal-role': 'employee',
  },
});

// Cache hardware fingerprint in-memory once computed to avoid disk I/O on every request
let cachedFingerprint = null;
getDeviceInfo().then((info) => {
  cachedFingerprint = info.fingerprint;
}).catch(() => {});

// ── Request Interceptor ────────────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  // Let multipart/form-data set its own boundary automatically
  if (
    config.data instanceof FormData ||
    config.data?._parts !== undefined ||
    (config.data && typeof config.data.append === 'function')
  ) {
    config.headers['Content-Type'] = 'multipart/form-data';
  }

  // 1. Attach JWT Authorization
  const token = await getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 2. Attach server-managed device binding token
  const deviceToken = await getDeviceToken();
  if (deviceToken) {
    config.headers['x-device-token'] = deviceToken;
  }

  // 3. Attach hardware fingerprint as supporting context
  if (!cachedFingerprint) {
    try {
      const info = await getDeviceInfo();
      cachedFingerprint = info.fingerprint;
    } catch {}
  }
  if (cachedFingerprint) {
    config.headers['x-device-fingerprint'] = cachedFingerprint;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Global callback hooks for auth events (e.g. forced logout)
let onUnauthorizedCallback = null;
export const setOnUnauthorizedListener = (fn) => {
  onUnauthorizedCallback = fn;
};

// ── Response Interceptor ───────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data?.data;

    // Attach user-facing message helper
    error.userMessage = error.response?.data?.message || error.message || 'Network connection failure.';

    if (status === 401) {
      // Clear local session credentials
      await clearAllSessionData();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    if (status === 403 && errorData?.code === 'DEVICE_MISMATCH') {
      error.isDeviceMismatch = true;
      error.mismatchData = errorData;
    }

    return Promise.reject(error);
  }
);

export default api;

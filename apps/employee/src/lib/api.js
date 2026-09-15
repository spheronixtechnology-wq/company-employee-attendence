import axios from 'axios';
import { getDeviceFingerprint, getCachedDeviceFingerprint } from './fingerprint';

// Eagerly initiate fingerprint calculation in background
getDeviceFingerprint().catch(() => {});

// Calculate base URL: always prefer relative /api when running in browser on HTTPS (e.g. https://localhost:3002)
// to prevent mixed-content blocking and cross-origin SameSite cookie rejections
const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:' && envUrl?.startsWith('http://localhost')) {
      return '/api';
    }
  }
  return envUrl || '/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'x-portal-role': 'employee' },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const token = localStorage.getItem('deviceToken');
  if (token) {
    config.headers['x-device-token'] = token;
  }

  // Attach device fingerprint header (use cached if available, or await computation)
  let fp = getCachedDeviceFingerprint();
  if (!fp) {
    try {
      fp = await getDeviceFingerprint();
    } catch {}
  }
  if (fp) {
    config.headers['x-device-fingerprint'] = fp;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear any local state and redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

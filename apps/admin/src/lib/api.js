import axios from 'axios';

/**
 * Shared Axios instance used across all frontend apps.
 * - withCredentials: true sends httpOnly cookies on every request
 * - baseURL points to the Vite dev proxy (/api -> localhost:5000)
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'x-portal-role': 'admin',
  },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Response interceptor — redirect to login on 401 (excluding step-up challenge failures)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isStepUpChallenge = error.config?.url?.includes('/auth/step-up');
    if (error.response?.status === 401 && !isStepUpChallenge) {
      // Clear any local state and redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

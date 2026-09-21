import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getUserSession,
  setUserSession,
  clearAllSessionData,
} from '../lib/storage';
import { getDeviceInfo } from '../lib/device';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore authenticated session on app launch
  const restoreSession = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Check if we have an immediate cached session to render fast
      const cached = await getUserSession();
      if (cached) {
        setUser(cached);
      }

      // Verify token with backend /api/auth/me
      const res = await api.get('/auth/me');
      const freshUser = res.data?.data?.user;
      if (freshUser) {
        setUser(freshUser);
        await setUserSession(freshUser);
      } else {
        await clearAllSessionData();
        setUser(null);
      }
    } catch (err) {
      console.log('[Auth] Session restore failed (token invalid or expired):', err.userMessage || err.message);
      await clearAllSessionData();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  /**
   * Login user with device binding context
   */
  const login = async (email, password, extraData = {}) => {
    const devInfo = await getDeviceInfo();
    const payload = {
      email: email.trim().toLowerCase(),
      password,
      deviceFingerprint: extraData.deviceFingerprint || devInfo.fingerprint,
      deviceLabel: extraData.deviceLabel || devInfo.deviceLabel,
      isMobile: true,
      ...extraData,
    };

    const res = await api.post('/auth/login', payload);
    const data = res.data?.data;
    const loggedUser = data?.user;
    const token = data?.token;

    if (token) {
      await setAuthToken(token);
    }
    if (loggedUser) {
      setUser(loggedUser);
      await setUserSession(loggedUser);
    }

    return loggedUser;
  };

  /**
   * Log out user and clear all secure storage
   */
  const logout = async () => {
    try {
      await api.post('/auth/logout').catch(() => {});
    } finally {
      await clearAllSessionData();
      setUser(null);
    }
  };

  /**
   * Update user in state and persist to secure storage.
   * Called directly by ProfileScreen after a successful profile save,
   * or by the socket listener when another device updates the profile.
   */
  const updateUserLocally = useCallback(async (updatedUser) => {
    if (!updatedUser) return;
    setUser(updatedUser);
    await setUserSession(updatedUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, updateUserLocally, restoreSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

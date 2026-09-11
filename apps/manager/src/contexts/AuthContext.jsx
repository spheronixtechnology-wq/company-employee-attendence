import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data.data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.data?.user) {
      setUser(res.data.data.user);
    }
    return res.data?.data;
  };

  const verifyMfaSetup = async (tempToken, otp) => {
    const res = await api.post('/auth/mfa/setup-verify', { tempToken, otp });
    if (res.data?.data?.user) {
      setUser(res.data.data.user);
    }
    return res.data?.data?.user;
  };

  const verifyMfa = async (tempToken, otp) => {
    const res = await api.post('/auth/mfa/verify', { tempToken, otp });
    if (res.data?.data?.user) {
      setUser(res.data.data.user);
    }
    return res.data?.data?.user;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        verifyMfaSetup,
        verifyMfa,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

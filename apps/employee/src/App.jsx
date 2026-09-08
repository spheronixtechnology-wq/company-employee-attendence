import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DailyLogPage from './pages/DailyLogPage';
import LeavePage from './pages/LeavePage';
import NotificationsPage from './pages/NotificationsPage';
import DeviceOnboardingPage from './pages/DeviceOnboardingPage';
import DeviceStatusPage from './pages/DeviceStatusPage';
import OfficeDisplayPage from './pages/OfficeDisplayPage';
import AttendanceHistoryPage from './pages/AttendanceHistoryPage';
import ProfilePage from './pages/ProfilePage';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from './lib/api';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="animate-spin text-primary-400" size={40} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
};

// Manual Attendance Request page
const ManualAttendancePage = () => {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ requestDate: '', reason: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/employee/manual-attendance/request', form);
      setMessage({ type: 'success', text: 'Manual attendance request submitted!' });
      setForm({ requestDate: '', reason: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit request.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-xl font-bold text-white">Manual Attendance Request</h1>
        <p className="text-slate-400 text-sm">Submit this if your regular check-in method failed (QR, WiFi, or Device).</p>
        {message && (
          <div className={`px-4 py-3 rounded-xl border text-sm ${message.type === 'success' ? 'bg-success-500/10 border-success-500/30 text-success-400' : 'bg-danger-500/10 border-danger-500/30 text-danger-400'}`}>
            {message.text}
          </div>
        )}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" required value={form.requestDate} onChange={e => setForm({ ...form, requestDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Reason *</label>
              <textarea className="input resize-none" rows={3} required minLength={10} placeholder="Explain why check-in failed..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
            </div>
            <button type="submit" id="submit-manual-request-btn" disabled={submitting} className="btn-primary w-full">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};



function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="animate-spin text-primary-400" size={40} />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      {/* Device Onboarding — full-screen, outside Layout */}
      <Route path="/device-onboarding" element={<ProtectedRoute><DeviceOnboardingPage onComplete={() => window.location.href = '/dashboard'} /></ProtectedRoute>} />
      {/* Office Display — PUBLIC kiosk page, no login required, no sidebar */}
      <Route path="/office-display" element={<OfficeDisplayPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/daily-log" element={<DailyLogPage />} />
                <Route path="/leave" element={<LeavePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/devices" element={<DeviceStatusPage />} />
                <Route path="/device-status" element={<DeviceStatusPage />} />
                <Route path="/attendance" element={<AttendanceHistoryPage />} />
                <Route path="/manual-attendance" element={<ManualAttendancePage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

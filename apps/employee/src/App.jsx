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
import { Loader2, ClipboardList, CheckCircle, XCircle, Clock } from 'lucide-react';
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
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/employee/manual-attendance/requests');
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      console.error('Failed to load manual requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await api.post('/employee/manual-attendance/request', form);
      setMessage({ type: 'success', text: 'Manual attendance request submitted successfully!' });
      setForm({ requestDate: '', reason: '' });
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit request.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return (
          <span className="badge-success text-xs flex items-center gap-1">
            <CheckCircle size={12} /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="badge-danger text-xs flex items-center gap-1">
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return (
          <span className="badge-warning text-xs flex items-center gap-1">
            <Clock size={12} /> Pending Review
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={22} className="text-primary-400" />
            Manual Attendance Request
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Submit this if your regular check-in method failed (QR, WiFi, or Device).
          </p>
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-success-500/10 border-success-500/30 text-success-400'
                : 'bg-danger-500/10 border-danger-500/30 text-danger-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-xs">Date *</label>
              <input
                type="date"
                className="input text-sm"
                required
                value={form.requestDate}
                onChange={(e) => setForm({ ...form, requestDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label text-xs">Reason *</label>
              <textarea
                className="input text-sm resize-none"
                rows={3}
                required
                minLength={3}
                placeholder="Explain why regular check-in failed (e.g. WiFi down, camera error)..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            <button
              type="submit"
              id="submit-manual-request-btn"
              disabled={submitting}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 font-medium"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Previous Requests History */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            Your Manual Attendance Requests
          </h2>

          {loadingRequests ? (
            <div className="py-4 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading past requests...
            </div>
          ) : requests.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-4">No manual attendance requests yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {requests.map((req) => (
                <div key={req._id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <p className="text-white font-medium">Work Date: {req.requestDate}</p>
                    <p className="text-slate-400">{req.reason}</p>
                    {req.decisionNote && (
                      <p className="text-slate-500 text-[11px] italic">Note: {req.decisionNote}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(req.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
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

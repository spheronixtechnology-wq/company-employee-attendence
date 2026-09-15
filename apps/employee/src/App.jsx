import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DailyLogPage from './pages/DailyLogPage';
import LeavePage from './pages/LeavePage';
import DeviceOnboardingPage from './pages/DeviceOnboardingPage';
import DeviceStatusPage from './pages/DeviceStatusPage';
import OfficeDisplayPage from './pages/OfficeDisplayPage';
import AttendanceHistoryPage from './pages/AttendanceHistoryPage';
import ProfilePage from './pages/ProfilePage';
import OvertimePage from './pages/OvertimePage';
import { Loader2, ClipboardList, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from './lib/api';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-sky-600" size={40} />
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
    <div className="relative page-container animate-fade-in">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* ── Gradient Hero Header ── */}
        <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400 shadow-[0_18px_44px_-16px_rgba(99,102,241,0.55)]">
          <div className="relative rounded-[calc(1.5rem-3px)] bg-gradient-to-br from-sky-500/95 via-indigo-500/95 to-violet-500/95 px-6 py-6">
            <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/15 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-sky-300/20 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/95 flex items-center justify-center shadow-[0_8px_22px_-8px_rgba(15,23,42,0.5)] flex-shrink-0">
                <ClipboardList size={22} className="text-indigo-500" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white/90 text-[10px] font-bold uppercase tracking-[0.14em] mb-1">
                  <Clock size={11} />
                  Fallback Check-In
                </div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)]">
                  Manual Attendance Request
                </h1>
                <p className="text-white/80 text-sm mt-0.5">
                  Use this if your regular check-in method failed (QR, WiFi, or Device). Your manager reviews every request.
                </p>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-2xl border text-sm flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600'
                : 'bg-rose-50/80 border-rose-100 text-rose-600'
            }`}
          >
            {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ── Two-column layout: form left, history right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          {/* Submission Form */}
          <div className="lg:col-span-3 bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-6 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
            <h2 className="font-bold text-slate-800 text-base mb-1">New Request</h2>
            <p className="text-xs text-slate-400 mb-5">Fill in the details below and submit for manager review.</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label text-xs">Work Date *</label>
                <input
                  type="date"
                  className="input text-sm"
                  required
                  value={form.requestDate}
                  onChange={(e) => setForm({ ...form, requestDate: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">The day you were unable to check in.</p>
              </div>
              <div>
                <label className="label text-xs">Reason *</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={4}
                  required
                  minLength={3}
                  placeholder="Explain why regular check-in failed (e.g. WiFi down, camera error)..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Be specific — your manager approves based on this explanation.</p>
              </div>
              <button
                type="submit"
                id="submit-manual-request-btn"
                disabled={submitting}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 font-bold"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>

          {/* Request History */}
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-violet-500" />
                Past Requests
              </h2>
              {requests.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100/80 text-violet-600 shadow-[inset_0_1px_2px_rgba(139,92,246,0.15)]">
                  {requests.length}
                </span>
              )}
            </div>

            {loadingRequests ? (
              <div className="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" /> Loading past requests...
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-2.5 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-400 flex items-center justify-center">
                  <CheckCircle size={20} />
                </div>
                <p className="text-slate-500 text-xs font-semibold">No requests yet</p>
                <p className="text-slate-400 text-[11px] mt-0.5">Submitted requests will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
                {requests.map((req) => (
                  <div key={req._id} className="p-3 rounded-2xl border border-violet-50 bg-white/70 hover:bg-white hover:shadow-[0_6px_18px_-8px_rgba(139,92,246,0.35)] transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 text-xs min-w-0">
                        <p className="text-slate-800 font-bold font-mono">{req.requestDate}</p>
                        <p className="text-slate-500">{req.reason}</p>
                        {req.decisionNote && (
                          <p className="text-slate-400 text-[11px] italic">Note: {req.decisionNote}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(req.status)}
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};



function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-sky-600" size={40} />
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
                <Route path="/overtime" element={<OvertimePage />} />
                <Route path="/daily-log" element={<DailyLogPage />} />
                <Route path="/leave" element={<LeavePage />} />
                <Route path="/notifications" element={<Navigate to="/dashboard" replace />} />
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

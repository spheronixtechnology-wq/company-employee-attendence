import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import TeamsPage from './pages/TeamsPage';
import ManagerPermissionsPage from './pages/ManagerPermissionsPage';
import { DeviceRequestsPage, OfficeLocationsPage, LocationRequestsPage } from './pages/AttendanceRequestsPages';
import WifiSettingsPage from './pages/WifiSettingsPage';
import { Loader2, QrCode, Wifi, Smartphone, Fingerprint, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from './lib/api';

// Inline simple pages to avoid too many files
const SimplePageWrapper = ({ title, description, content }) => (
  <div className="p-6 animate-fade-in">
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
    {content}
  </div>
);

// Leave Requests Admin Page
const LeaveRequestsPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const fetchRequests = async () => {
    try {
      const res = await api.get(`/admin/leave-requests?status=${filter}`);
      setRequests(res.data.data.requests || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, [filter]);

  const handleDecision = async (id, decision) => {
    const reason = decision === 'rejected' ? prompt('Rejection reason:') : '';
    if (decision === 'rejected' && !reason) return;
    try {
      await api.post(`/admin/leave/${id}/decision`, { decision, decisionNote: reason });
      fetchRequests();
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Leave Requests</h1>
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} id={`filter-${s}`} onClick={() => setFilter(s)}
            className={`btn ${filter === s ? 'btn-primary' : 'btn-ghost'} text-xs capitalize`}>
            {s}
          </button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary-400" size={28} /></div> : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req._id} className="card flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-semibold">{req.userId?.name}</p>
                <p className="text-slate-400 text-xs">{req.leaveTypeId?.name} · {req.startDate} → {req.endDate} ({req.totalDays}d)</p>
                <p className="text-slate-500 text-xs">{req.reason}</p>
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                  <button id={`approve-leave-${req._id}`} onClick={() => handleDecision(req._id, 'approved')} className="btn-success text-xs px-3 py-1.5">Approve</button>
                  <button id={`reject-leave-${req._id}`} onClick={() => handleDecision(req._id, 'rejected')} className="btn-danger text-xs px-3 py-1.5">Reject</button>
                </div>
              )}
              {req.status !== 'pending' && <span className={req.status === 'approved' ? 'badge-success' : 'badge-danger'}>{req.status}</span>}
            </div>
          ))}
          {requests.length === 0 && <p className="text-slate-500 text-center py-8">No {filter} leave requests.</p>}
        </div>
      )}
    </div>
  );
};

// Attendance Method Admin Page
const AttendanceMethodPage = () => {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchActiveMethod = async () => {
    try {
      const res = await api.get('/admin/attendance-method/active');
      setCurrent(res.data?.data?.activeMethod);
    } catch (err) {
      console.error('Failed to load active attendance method:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveMethod();
  }, []);

  const handleSwitchMethod = async (methodKey) => {
    const methodObj = methods.find(m => m.key === methodKey);
    const reason = prompt(`Reason for switching attendance verification method to "${methodObj?.label || methodKey}"?`);
    if (!reason || !reason.trim()) return;

    setSwitching(true);
    try {
      await api.patch('/admin/attendance-method/switch', { method: methodKey, reason: reason.trim() });
      setCurrent(methodKey);
      alert(`Attendance method switched to ${methodObj?.label || methodKey} successfully!`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to switch attendance method');
    } finally {
      setSwitching(false);
    }
  };

  const methods = [
    {
      key: 'qr_code',
      label: 'QR Code Attendance',
      icon: QrCode,
      desc: 'Daily dynamic rotating QR code. Employees scan the office QR display at check-in.',
      badge: 'Popular',
    },
    {
      key: 'wifi_ip',
      label: 'WiFi / IP Network Gate',
      icon: Wifi,
      desc: 'Validates employee presence on approved office Wi-Fi networks by checking IP/subnet match.',
      badge: 'Zero-touch',
    },
    // {
    //   key: 'device_fingerprint',
    //   label: 'Device Fingerprint Lock',
    //   icon: Smartphone,
    //   desc: 'Binds employee check-in exclusively to pre-registered and approved hardware devices.',
    //   badge: 'Strict Trust',
    // },
    {
      key: 'biometric',
      label: 'Biometric (WebAuthn / FIDO2)',
      icon: Fingerprint,
      desc: 'Device-owner biometric verification using hardware sensors (Fingerprint, TouchID, FaceID, or PIN).',
      badge: 'High Security',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-400" size={36} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-primary-500/20 text-primary-400">
              <ShieldCheck size={24} />
            </span>
            Attendance Verification Method
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure the required verification mode for all employee check-ins across the organization.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">Active Mode:</span>
          <span className="text-xs font-bold text-primary-300 uppercase tracking-wider">
            {current ? current.replace('_', ' ') : 'Loading...'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {methods.map(m => {
          const Icon = m.icon;
          const isActive = current === m.key;

          return (
            <div
              key={m.key}
              className={`card relative transition-all duration-200 p-5 ${
                isActive
                  ? 'border-primary-500 bg-gradient-to-br from-primary-950/40 via-slate-800/80 to-slate-800 shadow-lg shadow-primary-900/20 ring-1 ring-primary-500/50'
                  : 'hover:border-slate-600 bg-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl ${
                      isActive ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30' : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{m.label}</h3>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      {m.badge}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                    <CheckCircle2 size={13} /> Active
                  </span>
                )}
              </div>

              <p className="text-slate-300 text-sm mb-5 leading-relaxed">
                {m.desc}
              </p>

              <div>
                {isActive ? (
                  <div className="text-center py-2 text-xs font-medium text-emerald-400/90 bg-emerald-950/30 rounded-xl border border-emerald-500/20">
                    Currently enforced at employee check-in
                  </div>
                ) : (
                  <button
                    id={`switch-to-${m.key}`}
                    disabled={switching}
                    onClick={() => handleSwitchMethod(m.key)}
                    className="btn bg-slate-700 hover:bg-primary-600 hover:text-white text-slate-200 text-xs w-full py-2.5 transition-colors font-semibold"
                  >
                    {switching ? 'Updating...' : `Switch to ${m.label}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Placeholder pages
const PlaceholderPage = ({ title }) => (
  <div className="p-6"><h1 className="text-2xl font-bold text-white">{title}</h1><p className="text-slate-400 mt-2">Coming soon...</p></div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-900"><Loader2 className="animate-spin text-primary-400" size={40} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 space-y-4">
        <p className="p-6 text-danger-400 text-lg">Access denied. Admin only.</p>
        <button onClick={logout} className="btn-primary">Log Out / Switch Account</button>
      </div>
    );
  }
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-900"><Loader2 className="animate-spin text-primary-400" size={40} /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AdminLayout>
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/manager-permissions" element={<ManagerPermissionsPage />} />
              <Route path="/leave-requests" element={<LeaveRequestsPage />} />
              <Route path="/attendance" element={<PlaceholderPage title="Attendance Records" />} />
              <Route path="/attendance-method" element={<AttendanceMethodPage />} />
              <Route path="/wifi-settings" element={<WifiSettingsPage />} />

              <Route path="/device-requests" element={<DeviceRequestsPage />} />
              <Route path="/office-locations" element={<OfficeLocationsPage />} />
              <Route path="/location-requests" element={<LocationRequestsPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AdminLayout>
        </ProtectedRoute>
      } />
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

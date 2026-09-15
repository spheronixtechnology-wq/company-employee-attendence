import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import TeamsPage from './pages/TeamsPage';
import ManagerPermissionsPage from './pages/ManagerPermissionsPage';
import { DeviceRequestsPage, OfficeLocationsPage } from './pages/AttendanceRequestsPages';
import WifiSettingsPage from './pages/WifiSettingsPage';
import AttendanceRecordsPage from './pages/AttendanceRecordsPage';
import LeaveRequestsPage from './pages/LeaveRequestsPage';
import AdminOvertimePage from './pages/AdminOvertimePage';
import ProfilePage from './pages/ProfilePage';
import { Loader2, QrCode, Wifi, Smartphone, Fingerprint, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from './lib/api';

// Inline simple pages to avoid too many files
const SimplePageWrapper = ({ title, description, content }) => (
  <div className="p-6 animate-fade-in">
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-600 text-sm">{description}</p>
    </div>
    {content}
  </div>
);


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
        <Loader2 className="animate-spin text-primary-600" size={36} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <ShieldCheck size={24} />
            </span>
            Attendance Verification Method
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Configure the required verification mode for all employee check-ins across the organization.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-600">Active Mode:</span>
          <span className="text-xs font-bold text-sky-700 uppercase tracking-wider">
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
                  ? 'border-sky-500 bg-sky-50/50 shadow-md ring-2 ring-sky-500/20'
                  : 'hover:border-slate-300 bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl ${
                      isActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{m.label}</h3>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      {m.badge}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <CheckCircle2 size={13} /> Active
                  </span>
                )}
              </div>

              <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                {m.desc}
              </p>

              <div>
                {isActive ? (
                  <div className="text-center py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                    Currently enforced at employee check-in
                  </div>
                ) : (
                  <button
                    id={`switch-to-${m.key}`}
                    disabled={switching}
                    onClick={() => handleSwitchMethod(m.key)}
                    className="btn bg-slate-100 hover:bg-sky-600 hover:text-white text-slate-700 text-xs w-full py-2.5 transition-colors font-semibold border border-slate-200"
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
  <div className="p-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="text-slate-600 mt-2">Coming soon...</p></div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="animate-spin text-primary-600" size={40} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 space-y-4">
        <p className="p-6 text-rose-600 font-semibold text-lg">Access denied. Admin only.</p>
        <button onClick={logout} className="btn-primary">Log Out / Switch Account</button>
      </div>
    );
  }
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="animate-spin text-primary-600" size={40} /></div>;

  return (
    <Routes location={location}>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AdminLayout>
            <Routes location={location} key={location.pathname}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/manager-permissions" element={<ManagerPermissionsPage />} />
              <Route path="/leave-requests" element={<LeaveRequestsPage />} />
              <Route path="/attendance" element={<AttendanceRecordsPage />} />
              <Route path="/overtime" element={<AdminOvertimePage />} />
              <Route path="/attendance-method" element={<AttendanceMethodPage />} />
              <Route path="/wifi-settings" element={<WifiSettingsPage />} />

              <Route path="/device-requests" element={<DeviceRequestsPage />} />
              <Route path="/office-locations" element={<OfficeLocationsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

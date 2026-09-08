import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import ManagerPermissionsPage from './pages/ManagerPermissionsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import { DeviceRequestsPage, OfficeLocationsPage, LocationRequestsPage } from './pages/AttendanceRequestsPages';
import { Loader2 } from 'lucide-react';
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

// QR Code Admin Page
const QrCodePage = () => {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/qr/current').then(res => setQr(res.data.data.qr)).catch(() => setQr(null)).finally(() => setLoading(false));
  }, []);

  const regenerate = async () => {
    const reason = prompt('Reason for regenerating QR code?');
    if (!reason) return;
    try {
      const res = await api.post('/admin/qr/regenerate', { reason });
      setQr(res.data.data.qr);
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">QR Code Management</h1>
      <div className="card text-center">
        {loading ? <Loader2 className="animate-spin mx-auto" size={28} /> : qr ? (
          <>
            <p className="text-slate-400 text-sm mb-4">Today's QR Code Value</p>
            <div className="font-mono text-lg text-primary-400 bg-slate-700 rounded-xl p-4 break-all mb-4">{qr.codeValue}</div>
            <p className="text-xs text-slate-500">Valid: {qr.validDate} · Expires at midnight</p>
            <button id="regenerate-qr-btn" onClick={regenerate} className="btn-primary mt-4">Regenerate QR Code</button>
          </>
        ) : (
          <>
            <p className="text-slate-500 mb-4">No QR code for today yet.</p>
            <button id="generate-qr-btn" onClick={regenerate} className="btn-primary">Generate Today's QR Code</button>
          </>
        )}
      </div>
    </div>
  );
};

// Geofence Admin Page
const GeofencePage = () => {
  const [geo, setGeo] = useState(null);
  const [form, setForm] = useState({ officeName: '', latitude: '', longitude: '', radiusMeters: 200 });
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    api.get('/admin/geofence').then(res => {
      const g = res.data.data.geofence;
      if (g) { setGeo(g); setForm({ officeName: g.officeName, latitude: g.latitude, longitude: g.longitude, radiusMeters: g.radiusMeters }); }
    }).catch(console.error);
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch('/admin/geofence', form);
      setGeo(res.data.data.geofence);
      alert('Geofence updated!');
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const autoDetect = () => {
    if (!navigator.geolocation) return alert('Geolocation is not supported by your browser.');
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setDetecting(false);
      },
      (err) => {
        alert('Failed to detect location. Please ensure location permissions are granted.');
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Geofence Settings</h1>
      <div className="card max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <div><label className="label">Office Name</label><input className="input" value={form.officeName} onChange={e => setForm({...form, officeName: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Latitude</label><input type="number" step="any" className="input" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} /></div>
            <div><label className="label">Longitude</label><input type="number" step="any" className="input" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} /></div>
          </div>
          <div><label className="label">Radius (meters)</label><input type="number" className="input" value={form.radiusMeters} onChange={e => setForm({...form, radiusMeters: e.target.value})} /></div>
          
          <button type="button" onClick={autoDetect} disabled={detecting} className="btn-ghost w-full">
            {detecting ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null} {detecting ? 'Detecting Location...' : 'Auto Detect Location'}
          </button>

          <button type="submit" id="save-geofence-btn" disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null} {saving ? 'Saving...' : 'Update Geofence'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Attendance Method Admin Page
const AttendanceMethodPage = () => {
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    api.get('/admin/attendance-method/active').then(res => setCurrent(res.data.data.activeMethod)).catch(console.error);
  }, []);

  const switchMethod = async (method) => {
    const reason = prompt(`Reason for switching to ${method}?`);
    if (!reason) return;
    try {
      await api.patch('/admin/attendance-method/switch', { method, reason });
      setCurrent(method);
      alert('Attendance method switched!');
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  const methods = [
    { key: 'qr_code', label: 'QR Code', desc: 'Daily rotating QR code. Employees scan at check-in.' },
    { key: 'wifi_ip', label: 'WiFi / IP', desc: 'Validates employee is on office network by IP address.' },
    { key: 'device_fingerprint', label: 'Device Fingerprint', desc: 'Pre-registered and approved device required.' },
    { key: 'biometric', label: 'Biometric Attendance', desc: 'Device-owner authentication using phone biometric sensor (fingerprint, Face ID, or PIN).' },
  ];

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Attendance Method</h1>
      <p className="text-slate-400 text-sm">Only one method can be active at a time. All methods require geofence validation.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {methods.map(m => (
          <div key={m.key} className={`card cursor-pointer transition-all ${current === m.key ? 'border-primary-500 bg-primary-500/10' : 'hover:border-slate-500'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">{m.label}</h3>
              {current === m.key && <span className="badge-success">Active</span>}
            </div>
            <p className="text-slate-400 text-xs mb-4">{m.desc}</p>
            {current !== m.key && (
              <button id={`switch-${m.key}`} onClick={() => switchMethod(m.key)} className="btn-ghost text-xs w-full">
                Switch to {m.label}
              </button>
            )}
          </div>
        ))}
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
              <Route path="/teams" element={<PlaceholderPage title="Team Management" />} />
              <Route path="/manager-permissions" element={<ManagerPermissionsPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/leave-requests" element={<LeaveRequestsPage />} />
              <Route path="/attendance" element={<PlaceholderPage title="Attendance Records" />} />
              <Route path="/manual-attendance" element={<PlaceholderPage title="Manual Attendance Requests" />} />
              <Route path="/performance-notes" element={<PlaceholderPage title="Performance Notes" />} />
              <Route path="/attendance-method" element={<AttendanceMethodPage />} />
              <Route path="/qr-code" element={<QrCodePage />} />
              <Route path="/wifi-settings" element={<PlaceholderPage title="WiFi / IP Settings" />} />
              <Route path="/geofence" element={<GeofencePage />} />

              <Route path="/device-requests" element={<DeviceRequestsPage />} />
              <Route path="/office-locations" element={<OfficeLocationsPage />} />
              <Route path="/location-requests" element={<LocationRequestsPage />} />
              <Route path="/reports" element={<PlaceholderPage title="Reports & Analytics" />} />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Users, UserCheck, Calendar, ClipboardList, Settings,
  TrendingUp, Shield, AlertCircle, MapPin, Fingerprint,
  RefreshCw, Loader2
} from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, color = 'primary', onClick }) => (
  <div
    className={`card flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-slate-500 transition-colors' : ''}`}
    onClick={onClick}
  >
    <div className={`p-3 rounded-xl bg-${color}-500/20 flex-shrink-0`}>
      <Icon size={22} className={`text-${color}-400`} />
    </div>
    <div>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/admin/dashboard');
      setData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin text-primary-400" size={40} />
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge-info">
            Active: <strong className="ml-1">{data?.activeAttendanceMethod?.replace('_', ' ').toUpperCase() || 'QR CODE'}</strong>
          </span>
          <button id="admin-refresh-btn" onClick={fetchDashboard} className="btn-ghost p-2.5">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Employees" value={data?.totalEmployees} color="primary" />
        <StatCard icon={UserCheck} label="Checked In Today" value={data?.checkedInToday} color="success" />
        <StatCard icon={AlertCircle} label="Absent Today" value={data?.absentToday} color="danger" />
        <StatCard icon={Calendar} label="On Leave Today" value={data?.onLeaveToday} color="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Pending Leaves" value={data?.pendingLeaveRequests} color="warning" />
        <StatCard icon={MapPin} label="Location Requests" value={data?.pendingLocationRequests ?? 0} color="warning" />
        <StatCard icon={Fingerprint} label="Pending Devices" value={data?.pendingDeviceApprovals} color="primary" />
        <StatCard icon={AlertCircle} label="Missing Daily Logs" value={data?.missingDailyLogs} color="danger" />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Manage Users', icon: Users, href: '/employees', id: 'qa-users' },
            { label: 'Leave Requests', icon: Calendar, href: '/leave-requests', id: 'qa-leaves' },
            { label: 'Manager Permissions', icon: Shield, href: '/manager-permissions', id: 'qa-permissions' },
            { label: 'System Settings', icon: Settings, href: '/attendance-method', id: 'qa-settings' },
          ].map((action) => (
            <a key={action.href} href={action.href} id={action.id} className="card flex flex-col items-center gap-3 py-4 hover:border-primary-500/50 transition-colors cursor-pointer text-center">
              <action.icon size={20} className="text-primary-400" />
              <span className="text-sm font-medium text-slate-300">{action.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

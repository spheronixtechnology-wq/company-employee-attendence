import { useState, useEffect } from 'react';
import api from '../lib/api';
import { ScrollText, Search, Loader2, Filter } from 'lucide-react';

const ACTION_LABELS = {
  attendance_override: { label: 'Attendance Override', color: 'danger' },
  geofence_override: { label: 'Geofence Override', color: 'danger' },
  daily_log_lock_override: { label: 'Daily Log Lock Override', color: 'warning' },
  leave_approved: { label: 'Leave Approved', color: 'success' },
  leave_rejected: { label: 'Leave Rejected', color: 'danger' },
  leave_decision_overridden: { label: 'Leave Decision Override', color: 'warning' },
  manual_attendance_approved: { label: 'Manual Attendance Approved', color: 'success' },
  manual_attendance_rejected: { label: 'Manual Attendance Rejected', color: 'danger' },
  manager_permission_updated: { label: 'Manager Permission Updated', color: 'primary' },
  attendance_method_switched: { label: 'Attendance Method Switched', color: 'primary' },
  qr_code_regenerated: { label: 'QR Code Regenerated', color: 'primary' },
  device_approved: { label: 'Device Approved', color: 'success' },
  device_rejected: { label: 'Device Rejected', color: 'danger' },
  wifi_setting_updated: { label: 'WiFi Setting Updated', color: 'primary' },
  geofence_setting_updated: { label: 'Geofence Updated', color: 'primary' },
  user_created: { label: 'User Created', color: 'primary' },
  user_updated: { label: 'User Updated', color: 'primary' },
  user_deactivated: { label: 'User Deactivated', color: 'warning' },
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50, ...filters });
      Object.keys(filters).forEach(k => !filters[k] && params.delete(k));
      const res = await api.get(`/admin/audit-logs?${params}`);
      setLogs(res.data.data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [filters, page]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ScrollText size={22} className="text-primary-400" /> Audit Logs
        </h1>
        <p className="text-slate-400 text-sm">Immutable record of all sensitive system actions</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Filter by Action</label>
            <select className="input" value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })}>
              <option value="">All Actions</option>
              {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From Date</label>
            <input type="date" className="input" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input type="date" className="input" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-400" size={32} /></div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-700/30">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Performed By</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Target User</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'gray' };
                  return (
                    <tr key={log._id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge badge-${actionInfo.color}`}>{actionInfo.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-xs font-medium">{log.performedBy?.name || '—'}</p>
                        <p className="text-slate-500 text-xs capitalize">{log.performedByRole}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{log.targetUserId?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{log.reason || '—'}</td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-slate-500 py-8">No audit logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

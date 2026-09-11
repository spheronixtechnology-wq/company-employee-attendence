import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import {
  Users, UserCheck, Calendar, ClipboardList, AlertCircle,
  Loader2, RefreshCw, CheckCircle, XCircle, Clock,
  Smartphone, ShieldAlert, ChevronRight, Eye
} from 'lucide-react';

import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';
import DonutChart from '../components/timechamp/DonutChart';
import ManagerPunchCard from '../components/ManagerPunchCard';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Day');

  // Team members list for "Work Hours (Avg)" table
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

  // Pending approvals list
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [pendingDevices, setPendingDevices] = useState([]);
  const [actionProcessing, setActionProcessing] = useState(null);

  const fetchDashboard = useCallback(() => {
    api.get('/manager/dashboard')
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchMembers = useCallback(() => {
    setMembersLoading(true);
    api.get('/manager/team/members')
      .then(res => {
        setMembers(res.data.data?.members || []);
      })
      .catch(console.error)
      .finally(() => setMembersLoading(false));
  }, []);

  const fetchPendingApprovals = useCallback(() => {
    api.get('/manager/team/leave-requests?status=pending')
      .then(res => setPendingLeaves(res.data.data?.requests?.slice(0, 3) || []))
      .catch(() => {});

    api.get('/manager/device-requests?status=pending')
      .then(res => setPendingDevices(res.data.data?.requests?.slice(0, 3) || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchMembers();
    fetchPendingApprovals();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboard();
        fetchMembers();
        fetchPendingApprovals();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchDashboard, fetchMembers, fetchPendingApprovals]);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      fetchDashboard();
      fetchMembers();
      fetchPendingApprovals();
    };

    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    socket.on('device:request_created', onUpdate);
    socket.on('device:request_resolved', onUpdate);
    socket.on('leave:request_created', onUpdate);
    socket.on('leave:request_resolved', onUpdate);

    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
      socket.off('device:request_created', onUpdate);
      socket.off('device:request_resolved', onUpdate);
      socket.off('leave:request_created', onUpdate);
      socket.off('leave:request_resolved', onUpdate);
    };
  }, [socket, fetchDashboard, fetchMembers, fetchPendingApprovals]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleLeaveDecision = async (id, status) => {
    setActionProcessing(id);
    try {
      await api.post(`/manager/team/leave/${id}/decision`, { status });
      fetchDashboard();
      fetchPendingApprovals();
    } catch (err) {
      console.error(err);
    } finally {
      setActionProcessing(null);
    }
  };

  const handleDeviceDecision = async (id, action) => {
    setActionProcessing(id);
    try {
      await api.patch(`/manager/device-requests/${id}/decision`, { action });
      fetchDashboard();
      fetchPendingApprovals();
    } catch (err) {
      console.error(err);
    } finally {
      setActionProcessing(null);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Team Attendance' },
    { id: 'logs', label: 'Daily Logs' },
    { id: 'leaves', label: 'Leave Requests', badge: data?.pendingLeaveRequests ? `${data.pendingLeaveRequests}` : null, badgeClass: 'bg-amber-500/20 text-amber-300' },
    { id: 'devices', label: 'Device Requests', badge: data?.pendingDeviceRequests ? `${data.pendingDeviceRequests}` : null, badgeClass: 'bg-violet-500/20 text-violet-300' },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'attendance') navigate('/team/attendance');
    if (tabId === 'logs') navigate('/team/daily-logs');
    if (tabId === 'leaves') navigate('/team/leave-requests');
    if (tabId === 'devices') navigate('/device-requests');
  };

  // Donut chart dataset
  const donutData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Checked In / Active', value: data.checkedIn || 0, color: '#10b981' },
      { name: 'Not Checked In', value: data.notCheckedIn || 0, color: '#f43f5e' },
      { name: 'On Approved Leave', value: data.onLeave || 0, color: '#f59e0b' },
      { name: 'Missing Daily Logs', value: data.missingDailyLogs || 0, color: '#8b5cf6' },
    ];
  }, [data]);

  // Paginated members
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return members.slice(start, start + pageSize);
  }, [members, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Loader2 className="animate-spin text-violet-400" size={36} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* ── Sub-Header & Navigation ── */}
      <PageHeader
        title="Team Dashboard"
        subtitle="Live team presence, shift progression, and quick management actions"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        date={currentDate}
        onPrevDate={handlePrevDate}
        onNextDate={handleNextDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        badgeText={`Active Mode: ${data?.activeAttendanceMethod?.replace('_', ' ').toUpperCase() || 'QR CODE'}`}
        rightActions={
          <button
            onClick={() => {
              fetchDashboard();
              fetchMembers();
              fetchPendingApprovals();
            }}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
            title="Refresh statistics"
          >
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* ── Manager Personal Shift Tracking Card ── */}
      <ManagerPunchCard
        onAttendanceChanged={() => {
          fetchDashboard();
          fetchMembers();
        }}
      />

      {/* ── 6 KPI Tiles Ribbon (TimeChamp style) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          icon={Users}
          label="Team Total"
          value={data?.teamTotal}
          variant="violet"
          subtext="Members"
          onClick={() => navigate('/team/members')}
        />
        <KpiTile
          icon={UserCheck}
          label="Checked In"
          value={data?.checkedIn}
          variant="green"
          subtext="Present"
          onClick={() => navigate('/team/attendance')}
        />
        <KpiTile
          icon={AlertCircle}
          label="Not Checked In"
          value={data?.notCheckedIn}
          variant="red"
          subtext="Absent"
        />
        <KpiTile
          icon={Calendar}
          label="On Leave"
          value={data?.onLeave}
          variant="amber"
          subtext="Approved"
          onClick={() => navigate('/team/leave-requests')}
        />
        <KpiTile
          icon={AlertCircle}
          label="Missing Daily Logs"
          value={data?.missingDailyLogs}
          variant="red"
          subtext="No Log"
          onClick={() => navigate('/team/daily-logs')}
        />
        <KpiTile
          icon={ClipboardList}
          label="Pending Leaves"
          value={data?.pendingLeaveRequests}
          variant="amber"
          subtext="To Review"
          onClick={() => navigate('/team/leave-requests')}
        />
      </div>

      {/* ── Two-Column Analytics Area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Donut Chart Split */}
        <div className="lg:col-span-5 flex flex-col">
          <Panel
            title="Team Attendance Today"
            subtitle="Real-time distribution of assigned workforce"
            badge="Live"
            className="h-full"
          >
            <DonutChart
              data={donutData}
              centerValue={`${data?.checkedIn || 0}/${data?.teamTotal || 0}`}
              centerLabel="Checked In"
            />
          </Panel>
        </div>

        {/* Right: Pending Approvals Quick Resolution Panel */}
        <div className="lg:col-span-7 flex flex-col">
          <Panel
            title="Pending Team Approvals"
            subtitle="Leave and device authorizations awaiting manager sign-off"
            badge={String((pendingLeaves.length + pendingDevices.length) || 0)}
            className="h-full"
          >
            <div className="space-y-3">
              {pendingLeaves.length === 0 && pendingDevices.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500/60" />
                  <p className="text-sm font-medium text-slate-700">All caught up!</p>
                  <p className="text-xs text-slate-500 mt-0.5">No pending leaves or device approvals for your team.</p>
                </div>
              ) : (
                <>
                  {/* Pending Leaves */}
                  {pendingLeaves.map((req) => (
                    <div
                      key={`leave-${req._id}`}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                          <Calendar size={15} className="text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 truncate">{req.userId?.name || 'Employee'}</p>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                              Leave: {req.leaveTypeId?.name || 'Leave'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {new Date(req.startDate).toLocaleDateString('en-IN')} – {new Date(req.endDate).toLocaleDateString('en-IN')} · {req.reason || 'No reason'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          disabled={actionProcessing === req._id}
                          onClick={() => handleLeaveDecision(req._id, 'rejected')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={actionProcessing === req._id}
                          onClick={() => handleLeaveDecision(req._id, 'approved')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Pending Devices */}
                  {pendingDevices.map((req) => (
                    <div
                      key={`dev-${req._id}`}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
                          <Smartphone size={15} className="text-violet-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 truncate">{req.userId?.name || 'Employee'}</p>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-violet-100 text-violet-800 font-semibold border border-violet-200">
                              Device Reg
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {req.requestedDeviceLabel || 'Registered Hardware'} · {req.reason || 'New attendance phone'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          disabled={actionProcessing === req._id}
                          onClick={() => handleDeviceDecision(req._id, 'reject')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={actionProcessing === req._id}
                          onClick={() => handleDeviceDecision(req._id, 'approve')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Team Member Work Hours & Live Activity Table (TimeChamp style) ── */}
      <Panel
        title="Work Hours & Live Activity"
        subtitle="Per-member punch status, working hours estimate, and log progression"
        badge={`${members.length} Members`}
      >
        {membersLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-violet-600" size={24} />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            No team members assigned to your supervision.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider bg-slate-50/50">
                    <th className="py-2.5 pl-2">Name</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5">Check-In</th>
                    <th className="py-2.5">Work Hours (Est)</th>
                    <th className="py-2.5 pr-2 text-right">Daily Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedMembers.map((m) => {
                    const statusConfig = {
                      checked_in: { label: 'Checked In', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                      on_break: { label: 'On Break', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                      checked_out: { label: 'Checked Out', color: 'text-sky-700 bg-sky-50 border-sky-200' },
                      not_checked_in: { label: 'Not Checked In', color: 'text-slate-600 bg-slate-100 border-slate-200' },
                    };
                    const st = statusConfig[m.currentStatus] || statusConfig.not_checked_in;
                    const hours = m.totalWorkMinutes ? `${Math.floor(m.totalWorkMinutes / 60)}h ${m.totalWorkMinutes % 60}m` : (m.currentStatus === 'checked_in' ? 'Running...' : '—');

                    return (
                      <tr key={m._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 pl-2 font-medium text-slate-900 flex items-center gap-2.5">
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt={m.name}
                              className="w-7 h-7 rounded-full object-cover shadow-xs ring-1 ring-violet-200"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
                              {m.name?.[0]?.toUpperCase() || 'U'}
                            </div>
                          )}
                          <div>
                            <span className="block font-semibold">{m.name}</span>
                            <span className="text-[10px] text-slate-500">{m.designation || 'Staff'}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="py-3 text-slate-600 font-mono">
                          {m.checkInTime ? new Date(m.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 font-mono font-semibold text-slate-900">
                          {hours}
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <span className="text-[11px] font-medium text-slate-500">
                            {m.currentStatus === 'checked_out' ? '✅ Log Filed' : m.currentStatus === 'checked_in' ? 'Pending EOD' : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (TimeChamp style) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 text-xs focus:outline-none focus:border-violet-500 shadow-sm"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span>per page</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-500">
                  {members.length === 0 ? '0 of 0' : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, members.length)} of ${members.length}`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    ‹
                  </button>
                  <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 font-bold border border-violet-200">
                    {currentPage}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

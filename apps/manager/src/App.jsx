import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import ManagerLayout from './components/ManagerLayout';
import { ManagerDeviceRequestsPage, ManagerLocationRequestsPage } from './pages/ManagerRequestsPages';
import { Loader2, X, Clock, Coffee, Timer, FileText, AlertTriangle, ExternalLink, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import api from './lib/api';

// ── Login Page (shared design) ──────────────────────────────────────────────
import { Eye, EyeOff, LogIn } from 'lucide-react';
const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) { setError(err.response?.data?.message || 'Login failed.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-violet-900/20 to-slate-900 p-4">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-violet-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Manager Portal</h1>
          <p className="text-slate-400 mt-1 text-sm">Spheronix Technology</p>
        </div>
        <div className="card-glass border border-slate-600/50 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-400 text-sm">{error}</div>}
            <div>
              <label className="label">Email</label>
              <input id="email" type="email" required className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input id="password" type={showPw ? 'text' : 'password'} required className="input pr-12" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" id="login-submit-btn" disabled={loading} className="btn bg-violet-600 hover:bg-violet-500 text-white btn-lg w-full">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ── Manager Dashboard ────────────────────────────────────────────────────────
const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchDashboard = useCallback(() => {
    api.get('/manager/dashboard').then(res => setData(res.data.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Poll every 30s + refetch when the tab becomes visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') fetchDashboard();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchDashboard();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchDashboard]);

  // Real-time socket updates for team dashboard
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchDashboard();
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    socket.on('device:request_created', onUpdate);
    socket.on('leave:request_created', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
      socket.off('device:request_created', onUpdate);
      socket.off('leave:request_created', onUpdate);
    };
  }, [socket, fetchDashboard]);

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="animate-spin text-violet-400" size={40} /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Team Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Team Total', value: data?.teamTotal, color: 'text-violet-400' },
          { label: 'Checked In', value: data?.checkedIn, color: 'text-success-400' },
          { label: 'Not Checked In', value: data?.notCheckedIn, color: 'text-danger-400' },
          { label: 'On Leave', value: data?.onLeave, color: 'text-warning-400' },
          { label: 'Missing Daily Logs', value: data?.missingDailyLogs, color: 'text-warning-400' },
          { label: 'Pending Leaves', value: data?.pendingLeaveRequests, color: 'text-primary-400' },
        ].map(item => (
          <div key={item.label} className="card text-center">
            <p className={`text-3xl font-bold ${item.color}`}>{item.value ?? '—'}</p>
            <p className="text-slate-400 text-xs mt-1">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Team Members Page ─────────────────────────────────────────────────────────
const TeamMembersPage = () => {
  const [data, setData] = useState({ teams: [], members: [] });
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchMembers = useCallback(() => {
    setLoading(true);
    api.get('/manager/team/members')
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Real-time updates for team member status
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      api.get('/manager/team/members')
        .then(res => setData(res.data.data))
        .catch(console.error);
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-violet-400" size={32} /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Members</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {data.teams.map(t => t.name).join(', ') || 'Managed Teams'} · {data.members.length} member{data.members.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.members.map(member => (
          <div key={member._id} className="card relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {member.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold truncate">{member.name}</p>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    member.currentStatus === 'checked_in' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    member.currentStatus === 'on_break' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    member.currentStatus === 'checked_out' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}>
                    {member.currentStatus === 'checked_in' ? '● Working' :
                     member.currentStatus === 'on_break' ? '☕ On Break' :
                     member.currentStatus === 'checked_out' ? '✓ Checked Out' : 'Offline'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5 truncate">{member.designation || 'Employee'}</p>
                <p className="text-slate-500 text-xs truncate">{member.email}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
              <span>Team: {member.teamId?.name || 'Unassigned'}</span>
              {member.phone && <span>{member.phone}</span>}
            </div>
          </div>
        ))}
      </div>
      {data.members.length === 0 && (
        <div className="card text-center py-12 text-slate-400">
          No team members found in your assigned team(s).
        </div>
      )}
    </div>
  );
};

// ── Team Attendance Page ───────────────────────────────────────────────────────
const TeamAttendancePage = () => {
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchAttendance = useCallback(() => {
    setLoading(true);
    api.get(`/manager/team/attendance?date=${date}`)
      .then(res => setRecords(res.data.data.attendance || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Real-time updates for attendance
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      api.get(`/manager/team/attendance?date=${date}`)
        .then(res => setRecords(res.data.data.attendance || []))
        .catch(console.error);
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket, date]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Team Attendance</h1>
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-400" size={28} /></div> : (
        <div className="space-y-3">
          {records.map(rec => (
            <div key={rec._id} className="card flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{rec.userId?.name}</p>
                <p className="text-slate-400 text-xs">
                  {rec.checkInTime ? `In: ${new Date(rec.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Not checked in'}
                  {rec.checkOutTime ? ` · Out: ${new Date(rec.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">{rec.totalWorkMinutes ? `${Math.floor(rec.totalWorkMinutes/60)}h ${rec.totalWorkMinutes%60}m` : '—'}</p>
                <span className={
                  rec.status === 'present' ? 'badge-success' :
                  rec.status === 'half_day' ? 'badge-warning' :
                  rec.status === 'absent' ? 'badge-danger' :
                  rec.status === 'not_checked_in' ? 'badge-gray' :
                  'badge-gray'
                }>{rec.status === 'not_checked_in' ? 'Not Checked In' : (rec.status || 'pending')}</span>
              </div>
            </div>
          ))}
          {records.length === 0 && <p className="text-slate-500 text-center py-8">No attendance records for {date}.</p>}
        </div>
      )}
    </div>
  );
};

// ── Team Leave Requests Page ──────────────────────────────────────────────────
const TeamLeaveRequestsPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/team/leave-requests?status=${filter}`);
      setRequests(res.data.data.requests || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Real-time updates for leave requests
  useEffect(() => {
    if (!socket) return;
    const onNewLeave = () => fetchRequests();
    socket.on('leave:request_created', onNewLeave);
    return () => {
      socket.off('leave:request_created', onNewLeave);
    };
  }, [socket, fetchRequests]);

  const handleDecision = async (id, decision) => {
    const decisionNote = decision === 'rejected' ? prompt('Rejection reason:') : '';
    if (decision === 'rejected' && !decisionNote) return;
    try {
      await api.post(`/manager/team/leave/${id}/decision`, { decision, decisionNote });
      fetchRequests();
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Team Leave Requests</h1>
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn ${filter === s ? 'btn-primary' : 'btn-ghost'} text-xs capitalize`}>{s}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-400" size={28} /></div> : (
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
                  <button id={`mgr-approve-${req._id}`} onClick={() => handleDecision(req._id, 'approved')} className="btn-success text-xs px-3 py-1.5">Approve</button>
                  <button id={`mgr-reject-${req._id}`} onClick={() => handleDecision(req._id, 'rejected')} className="btn-danger text-xs px-3 py-1.5">Reject</button>
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

const formatDuration = (mins = 0) => {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const formatTime = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Detailed Modal for Employee Daily Log & Shift Report ─────────────────────
const EmployeeLogDetailModal = ({ log, onClose }) => {
  if (!log) return null;

  const user = log.userId || {};
  const att = log.attendance || null;
  const breaks = att?.breaks || [];
  const checkIn = att?.checkInTime;
  const checkOut = att?.checkOutTime;
  const totalDuration = att?.totalDurationMinutes ?? 0;
  const totalBreaks = att?.totalBreakMinutes ?? 0;
  const actualWork = att?.actualWorkMinutes ?? Math.max(0, totalDuration - totalBreaks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-violet-500/20">
              {user.name?.[0]?.toUpperCase() || 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">{user.name || 'Employee'}</h2>
                {att?.status && (
                  <span className={
                    att.status === 'present' ? 'badge-success' :
                    att.status === 'half_day' ? 'badge-warning' :
                    'badge-gray'
                  }>{att.status}</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {user.designation || 'Team Member'} {user.email ? `· ${user.email}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Shift Metrics Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center mx-auto mb-1">
                <Clock size={15} />
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Gross Shift</p>
              <p className="text-sm font-bold text-white mt-0.5">{totalDuration ? formatDuration(totalDuration) : `${log.hoursSpent}h`}</p>
              <p className="text-[10px] text-slate-500">Duration</p>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-1">
                <Coffee size={15} />
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Total Breaks</p>
              <p className="text-sm font-bold text-amber-400 mt-0.5">{formatDuration(totalBreaks)}</p>
              <p className="text-[10px] text-slate-500">{breaks.length} break{breaks.length === 1 ? '' : 's'}</p>
            </div>

            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-center">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-1">
                <Timer size={15} />
              </div>
              <p className="text-[11px] text-emerald-400 font-medium">Actual Work</p>
              <p className="text-sm font-extrabold text-emerald-300 mt-0.5">{actualWork ? formatDuration(actualWork) : `${log.hoursSpent}h`}</p>
              <p className="text-[10px] text-emerald-400/70">Net Productive</p>
            </div>
          </div>

          {/* Timestamps */}
          {att && (
            <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-400">
                <span>Check-In Time:</span>
                <span className="font-semibold text-white">{formatTime(checkIn)}</span>
              </div>
              <div className="flex justify-between text-slate-400 border-t border-slate-800/80 pt-1.5">
                <span>Check-Out Time:</span>
                <span className="font-semibold text-white">{checkOut ? formatTime(checkOut) : 'Still Active'}</span>
              </div>
            </div>
          )}

          {/* Break Breakdown */}
          {breaks.length > 0 && (
            <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Coffee size={13} className="text-amber-400" /> Break Breakdown
                </span>
                <span className="text-xs font-mono text-slate-400">{formatDuration(totalBreaks)}</span>
              </div>
              <div className="space-y-1.5">
                {breaks.map((b, idx) => {
                  const bStart = b.startedAt ? new Date(b.startedAt) : null;
                  const bEnd = b.endedAt ? new Date(b.endedAt) : null;
                  const dur = (bStart && bEnd) ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 60000)) : 0;
                  const typeLabel = b.type ? (b.type.charAt(0).toUpperCase() + b.type.slice(1)) : 'Personal';
                  return (
                    <div key={b._id || idx} className="flex items-center justify-between p-2 bg-slate-800/60 rounded-lg text-xs">
                      <span className="text-slate-300">
                        #{idx + 1} {typeLabel} Break ({formatTime(bStart)} – {formatTime(bEnd)})
                      </span>
                      <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {dur}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Work Log Content */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <span className="font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <FileText size={14} className="text-violet-400" /> Daily Work Summary
              </span>
              <span className="px-2.5 py-0.5 bg-violet-500/10 border border-violet-500/30 text-violet-300 font-bold rounded-full">
                Logged: {log.hoursSpent}h
              </span>
            </div>

            {log.taskTitle && (
              <div>
                <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Task Title</p>
                <p className="text-white font-medium bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">{log.taskTitle}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {log.projectName && (
                <div>
                  <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Project</p>
                  <p className="text-white bg-slate-900/60 p-2 rounded-lg border border-slate-800">{log.projectName}</p>
                </div>
              )}
              {log.ticketId && (
                <div>
                  <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Ticket ID</p>
                  <p className="text-primary-400 font-mono bg-slate-900/60 p-2 rounded-lg border border-slate-800">{log.ticketId}</p>
                </div>
              )}
            </div>

            {log.campaignName && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Campaign</p>
                  <p className="text-white bg-slate-900/60 p-2 rounded-lg border border-slate-800">{log.campaignName}</p>
                </div>
                {log.platform && (
                  <div>
                    <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Platform</p>
                    <p className="text-white bg-slate-900/60 p-2 rounded-lg border border-slate-800">{log.platform}</p>
                  </div>
                )}
              </div>
            )}

            {log.outputSummary && (
              <div>
                <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Deliverables / Output Summary</p>
                <p className="text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 whitespace-pre-line">{log.outputSummary}</p>
              </div>
            )}

            {log.blockers && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-amber-400 font-bold flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={14} /> Blockers / Dependencies
                </p>
                <p className="text-amber-200 text-xs">{log.blockers}</p>
              </div>
            )}

            {log.attachmentUrl && (
              <div className="pt-1">
                <a
                  href={log.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost text-xs py-1.5 px-3 border border-slate-700 flex items-center gap-1.5 text-primary-400 hover:text-primary-300 w-fit"
                >
                  <ExternalLink size={13} /> View Attached File
                </a>
              </div>
            )}

            <div className="pt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-800">
              <span>Log Date: {log.logDate}</span>
              <span>Submitted: {log.submittedAt ? formatTime(log.submittedAt) : 'Today'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button onClick={onClose} className="btn-ghost text-xs py-2 px-4 border border-slate-700 hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Team Daily Logs Page ──────────────────────────────────────────────────────
const TeamDailyLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const { socket } = useSocket();

  const fetchLogs = useCallback(() => {
    setLoading(true);
    api.get(`/manager/team/daily-logs?date=${date}`)
      .then(res => setLogs(res.data.data.logs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time updates when employee submits daily log / sends report
  useEffect(() => {
    if (!socket) return;
    const onLogSubmitted = () => {
      console.log('⚡ [Manager] Received daily_log:submitted socket event');
      fetchLogs();
    };
    socket.on('daily_log:submitted', onLogSubmitted);
    socket.on('attendance:update', onLogSubmitted);
    return () => {
      socket.off('daily_log:submitted', onLogSubmitted);
      socket.off('attendance:update', onLogSubmitted);
    };
  }, [socket, fetchLogs]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Daily Logs</h1>
          <p className="text-slate-400 text-xs mt-0.5">Click any employee card to view their complete daily report & shift details</p>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-400" size={28} /></div> : (
        <div className="space-y-3">
          {logs.map(log => (
            <div
              key={log._id}
              onClick={() => setSelectedLog(log)}
              className="card cursor-pointer hover:border-violet-500/60 hover:bg-slate-800/70 transition-all duration-200 group relative"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold group-hover:text-violet-300 transition-colors">{log.userId?.name}</p>
                  {log.userId?.designation && (
                    <span className="text-[11px] text-slate-500">· {log.userId.designation}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 text-xs font-bold font-mono">
                    {log.hoursSpent}h
                  </span>
                  <ChevronRight size={16} className="text-slate-500 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
              {log.taskTitle && <p className="text-slate-300 text-xs font-medium">Task: {log.taskTitle}</p>}
              {log.projectName && <p className="text-slate-400 text-xs mt-0.5">Project: {log.projectName}</p>}
              {log.campaignName && <p className="text-slate-400 text-xs mt-0.5">Campaign: {log.campaignName}</p>}
              {log.blockers && <p className="text-warning-400 text-xs mt-1">⚠ Blockers: {log.blockers}</p>}

              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>{log.attendance?.checkInTime ? `Checked in: ${formatTime(log.attendance.checkInTime)}` : 'Logged today'}</span>
                <span className="text-violet-400/80 group-hover:text-violet-300 font-medium flex items-center gap-1">
                  View Full Report & Breakdown →
                </span>
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="text-slate-500 text-center py-8">No daily logs for {date}.</p>}
        </div>
      )}

      {/* Employee Detail Modal */}
      <EmployeeLogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
};

const PlaceholderPage = ({ title }) => (
  <div className="p-6"><h1 className="text-2xl font-bold text-white">{title}</h1><p className="text-slate-400 mt-2">This section is available when the required manager permission is enabled by Admin.</p></div>
);



const ProtectedRoute = ({ children }) => {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-900"><Loader2 className="animate-spin text-primary-400" size={40} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 space-y-4">
        <p className="p-6 text-danger-400 text-lg">Access denied. Manager only.</p>
        <button onClick={logout} className="btn-primary">Log Out / Switch Account</button>
      </div>
    );
  }
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-900"><Loader2 className="animate-spin text-violet-400" size={40} /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <ManagerLayout>
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/team/members" element={<TeamMembersPage />} />
              <Route path="/team/attendance" element={<TeamAttendancePage />} />
              <Route path="/team/daily-logs" element={<TeamDailyLogsPage />} />
              <Route path="/team/leave-requests" element={<TeamLeaveRequestsPage />} />
              <Route path="/team/task-history" element={<PlaceholderPage title="Team Task History" />} />
              <Route path="/team/performance" element={<PlaceholderPage title="Performance Notes" />} />
              <Route path="/device-requests" element={<ManagerDeviceRequestsPage />} />
              <Route path="/location-requests" element={<ManagerLocationRequestsPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ManagerLayout>
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

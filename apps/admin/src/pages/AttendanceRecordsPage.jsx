import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, ClipboardList, Clock, Calendar, CheckCircle2, XCircle,
  Search, RefreshCw, Filter, Users, Coffee, ArrowLeft, ArrowRight,
  ShieldCheck, AlertTriangle, ChevronRight, User
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState([]);
  const [teams, setTeams] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const { socket } = useSocket();

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const teamParam = selectedTeam !== 'all' ? `&teamId=${selectedTeam}` : '';
      const roleParam = selectedRole !== 'all' ? `&role=${selectedRole}` : '';
      const res = await api.get(`/admin/attendance?date=${date}${teamParam}${roleParam}`);
      const data = res.data?.data;
      setRecords(data?.attendance || []);
      if (data?.teams) {
        setTeams(data.teams);
      }
    } catch (err) {
      console.error('Failed to load attendance records:', err);
      setActionMessage({ type: 'error', text: 'Failed to load attendance records.' });
    } finally {
      setLoading(false);
    }
  }, [date, selectedTeam, selectedRole]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      fetchAttendance();
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket, fetchAttendance]);

  const handleDateShift = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleManualDecision = async (requestId, action) => {
    let note = '';
    if (action === 'reject') {
      const input = prompt('Reason for rejection (optional):');
      if (input === null) return;
      note = input;
    }

    setProcessingId(requestId + action);
    try {
      await api.post(`/admin/manual-attendance/${requestId}/decision`, {
        action,
        decisionNote: note || undefined,
      });
      setActionMessage({
        type: 'success',
        text: `Manual attendance request ${action === 'approve' ? 'approved ✅' : 'rejected ❌'}.`,
      });
      fetchAttendance();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || `Failed to ${action} manual attendance request.`,
      });
    } finally {
      setProcessingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Filter records by employee search term
  const filteredRecords = records.filter((rec) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = rec.userId?.name?.toLowerCase() || '';
    const email = rec.userId?.email?.toLowerCase() || '';
    const designation = rec.userId?.designation?.toLowerCase() || '';
    return name.includes(q) || email.includes(q) || designation.includes(q);
  });

  // Calculate stats
  const totalEmployees = records.length;
  const checkedInCount = records.filter((r) => r.checkInTime && !r.checkOutTime).length;
  const checkedOutCount = records.filter((r) => r.checkOutTime).length;
  const manualPendingCount = records.filter(
    (r) => r.status === 'manual_pending' || r.manualRequest?.status === 'pending'
  ).length;
  const absentCount = records.filter((r) => !r.checkInTime && !r.manualRequest).length;

  const formatTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const formatMethod = (method) => {
    switch (method) {
      case 'qr_code':
        return 'QR Code';
      case 'wifi_ip':
        return 'Office WiFi';
      case 'biometric':
        return 'Biometric';
      case 'device_fingerprint':
        return 'Device Lock';
      case 'manual':
        return 'Manual Approval';
      default:
        return method ? method.replace('_', ' ') : '—';
    }
  };

  return (
    <div className="page-container space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ClipboardList className="text-primary-600" size={26} />
            Attendance Records
          </h1>
          <p className="text-slate-600 text-xs mt-1">
            Company-wide attendance tracking, live shift check-ins, and manual attendance reviews.
          </p>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm">
          <button
            onClick={() => handleDateShift(-1)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
            title="Previous day"
          >
            <ArrowLeft size={16} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-slate-900 text-xs font-semibold px-2 py-1 outline-none border-none cursor-pointer"
          />
          <button
            onClick={() => handleDateShift(1)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
            title="Next day"
          >
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => setDate(new Date().toISOString().split('T')[0])}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors ml-1 border border-primary-200"
          >
            Today
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {actionMessage.text}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="card p-4 border border-slate-200 bg-white flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Users size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-600">Total Staff</p>
            <p className="text-xl font-bold text-slate-900">{totalEmployees}</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200 bg-white flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-600">Currently Working</p>
            <p className="text-xl font-bold text-emerald-700">{checkedInCount}</p>
          </div>
        </div>

        <div className="card p-4 border border-slate-200 bg-white flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-600">Completed Shift</p>
            <p className="text-xl font-bold text-blue-700">{checkedOutCount}</p>
          </div>
        </div>

        <div
          className={`card p-4 border flex items-center gap-3 transition-colors shadow-sm ${
            manualPendingCount > 0
              ? 'border-amber-300 bg-amber-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              manualPendingCount > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-[11px] text-slate-600">Pending Review</p>
            <p className={`text-xl font-bold ${manualPendingCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {manualPendingCount}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Team Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
            <Filter size={14} className="text-slate-500" />
            <span className="text-xs text-slate-600 font-medium">Team:</span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all" className="bg-white text-slate-800">All Teams</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id} className="bg-white text-slate-800">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
            <Users size={14} className="text-slate-500" />
            <span className="text-xs text-slate-600 font-medium">Role:</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all" className="bg-white text-slate-800">All Staff</option>
              <option value="employee" className="bg-white text-slate-800">Employees Only</option>
              <option value="manager" className="bg-white text-slate-800">Managers Only</option>
            </select>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={fetchAttendance}
            disabled={loading}
            className="btn bg-white text-xs px-3 py-2 flex items-center gap-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 shadow-sm"
            title="Refresh attendance"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary-600' : ''} />
            <span className="hidden sm:inline font-semibold">Refresh</span>
          </button>
        </div>

        {/* Search Filter */}
        <div className="relative min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-xs py-2 w-full border-slate-200 bg-white text-slate-900 shadow-sm"
          />
        </div>
      </div>

      {/* Attendance Record List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary-600 mb-2" size={32} />
          <p className="text-xs text-slate-600">Loading attendance records...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="card text-center py-16 border border-slate-200 bg-white shadow-sm">
          <ClipboardList className="mx-auto text-slate-400 mb-2" size={36} />
          <p className="text-sm font-bold text-slate-800">No attendance records found</p>
          <p className="text-xs text-slate-500 mt-1">
            No employees match the filter criteria for {date}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((rec) => {
            const isManualPending =
              rec.status === 'manual_pending' || rec.manualRequest?.status === 'pending';
            const hasManualReq = Boolean(rec.manualRequest && rec.manualRequest._id);

            return (
              <div
                key={rec._id}
                className={`card p-4 transition-all border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm ${
                  isManualPending
                    ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Employee Info */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm flex-shrink-0 border border-slate-200 shadow-sm">
                    {rec.userId?.avatarUrl ? (
                      <img
                        src={rec.userId.avatarUrl}
                        alt={rec.userId.name}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      rec.userId?.name?.charAt(0).toUpperCase() || 'E'
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm truncate">
                        {rec.userId?.name || 'Unknown Staff'}
                      </span>
                      {rec.userId?.role === 'manager' && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-extrabold border border-indigo-200 shadow-xs">
                          MANAGER
                        </span>
                      )}
                      {rec.userId?.teamId?.name && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                          {rec.userId.teamId.name}
                        </span>
                      )}
                      {rec.checkInMethod && (
                        <span className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-[10px] font-semibold border border-primary-200">
                          {formatMethod(rec.checkInMethod)}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-600 text-xs truncate">
                      {rec.userId?.designation || (rec.userId?.role === 'manager' ? 'Team Manager' : rec.userId?.email || 'Staff')}
                    </p>

                    {/* Pending Manual Review Reason Card */}
                    {isManualPending && rec.manualRequest?.reason && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 mt-2">
                        <span className="font-semibold text-amber-800 flex items-center gap-1 mb-0.5">
                          <AlertTriangle size={13} /> Manual Attendance Request Reason:
                        </span>
                        <p className="italic text-slate-700">"{rec.manualRequest.reason}"</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Shift Timings & Actions */}
                <div className="flex items-center gap-4 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-200">
                  {/* Timings */}
                  <div className="text-left md:text-right space-y-0.5">
                    <p className="text-xs text-slate-700 font-medium">
                      In: <span className="text-slate-900 font-bold">{formatTime(rec.checkInTime)}</span>
                      {rec.checkOutTime && (
                        <> · Out: <span className="text-slate-900 font-bold">{formatTime(rec.checkOutTime)}</span></>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {rec.totalWorkMinutes
                        ? `Net Work: ${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m`
                        : rec.checkInTime && !rec.checkOutTime
                        ? 'Active now'
                        : 'No session'}
                    </p>
                  </div>

                  {/* Manual Approval Action Buttons */}
                  {isManualPending && hasManualReq ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleManualDecision(rec.manualRequest._id, 'approve')}
                        disabled={Boolean(processingId)}
                        className="py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50 shadow-sm"
                      >
                        {processingId === rec.manualRequest._id + 'approve' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        Approve
                      </button>

                      <button
                        onClick={() => handleManualDecision(rec.manualRequest._id, 'reject')}
                        disabled={Boolean(processingId)}
                        className="py-1.5 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50 shadow-sm"
                      >
                        {processingId === rec.manualRequest._id + 'reject' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
                      </button>
                    </div>
                  ) : (
                    /* Standard Status Badge */
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                        rec.status === 'present'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : rec.status === 'half_day'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : rec.status === 'absent'
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : rec.status === 'leave'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {rec.status === 'not_checked_in'
                        ? 'Not Checked In'
                        : rec.status === 'manual_pending'
                        ? 'Pending Review'
                        : rec.status
                        ? rec.status.replace('_', ' ')
                        : 'Not Checked In'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

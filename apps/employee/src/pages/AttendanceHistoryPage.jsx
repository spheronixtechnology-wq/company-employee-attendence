import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Calendar, Clock, CheckCircle, AlertTriangle, Coffee,
  Timer, LogIn, LogOut, Loader2, ArrowLeft, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';

const formatDuration = (mins = 0) => {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const formatTime = (isoString) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  // Parse date string (YYYY-MM-DD)
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const StatusBadge = ({ status }) => {
  const config = {
    present: { label: 'Present', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    half_day: { label: 'Half Day', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    absent: { label: 'Absent', bg: 'bg-red-500/10 text-red-400 border-red-500/30' },
    leave: { label: 'On Leave', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    incomplete: { label: 'Incomplete', bg: 'bg-slate-700/50 text-slate-400 border-slate-600/40' },
    manual_pending: { label: 'Pending Approval', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  };

  const item = config[status] || { label: status || 'Pending', bg: 'bg-slate-700/50 text-slate-400 border-slate-600/40' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.bg}`}>
      {item.label}
    </span>
  );
};

export default function AttendanceHistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employee/attendance/me');
      setRecords(res.data?.data?.attendance || []);
      setSummary(res.data?.data?.summary || null);
    } catch (err) {
      console.error('Error fetching attendance history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const toggleExpand = (id) => {
    setExpandedRecordId(prev => (prev === id ? null : id));
  };

  return (
    <div className="page-container max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Attendance History</h1>
            <p className="page-subtitle">Track your past shifts, work hours, and breaks</p>
          </div>
        </div>
        <button
          onClick={fetchAttendance}
          disabled={loading}
          className="btn-ghost p-2 text-slate-400 hover:text-white"
          title="Refresh attendance"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary Stat Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card bg-slate-800/60 border border-slate-700/60 p-4 text-center">
            <p className="text-xs text-slate-400 font-medium">Total Days</p>
            <p className="text-2xl font-bold text-white mt-1">{summary.totalDays}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Recorded shifts</p>
          </div>
          <div className="card bg-slate-800/60 border border-slate-700/60 p-4 text-center">
            <p className="text-xs text-emerald-400 font-medium">Present</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{summary.presentCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Full shifts</p>
          </div>
          <div className="card bg-slate-800/60 border border-slate-700/60 p-4 text-center">
            <p className="text-xs text-amber-400 font-medium">Half Day</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{summary.halfDayCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Short shifts</p>
          </div>
          <div className="card bg-slate-800/60 border border-slate-700/60 p-4 text-center">
            <p className="text-xs text-primary-400 font-medium">Total Hours</p>
            <p className="text-2xl font-bold text-primary-300 mt-1">{summary.totalHours}h</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Net productive</p>
          </div>
        </div>
      )}

      {/* Attendance List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary-400 mb-3" size={32} />
          <p className="text-slate-400 text-sm">Loading attendance records...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="card text-center py-12 border border-slate-800 bg-slate-850/50">
          <Calendar size={40} className="text-slate-600 mx-auto mb-3" />
          <h3 className="text-white font-medium text-base mb-1">No attendance records found</h3>
          <p className="text-slate-400 text-xs max-w-sm mx-auto">
            Once you check in and check out, your attendance logs will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec) => {
            const isExpanded = expandedRecordId === rec._id;
            const breaks = rec.breaks || [];
            const hasBreaks = breaks.length > 0;
            const totalWork = rec.actualWorkMinutes ?? rec.totalWorkMinutes ?? 0;
            const totalBreak = rec.totalBreakMinutes ?? rec.completedBreakMinutes ?? 0;

            return (
              <div
                key={rec._id}
                className="card border border-slate-700/60 hover:border-slate-600 transition-all bg-slate-800/80 overflow-hidden"
              >
                {/* Main Card Row */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  onClick={() => hasBreaks && toggleExpand(rec._id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-base">{formatDate(rec.date)}</span>
                      <StatusBadge status={rec.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1 text-slate-300">
                        <LogIn size={13} className="text-emerald-400" />
                        {rec.checkInTime ? formatTime(rec.checkInTime) : 'No check-in'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <LogOut size={13} className="text-red-400" />
                        {rec.checkOutTime ? (
                          formatTime(rec.checkOutTime)
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Session in progress
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-700/60 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center sm:justify-end gap-1.5 text-sm font-bold text-white">
                        <Timer size={14} className="text-primary-400" />
                        <span>{totalWork > 0 ? formatDuration(totalWork) : '0m'}</span>
                      </div>
                      {totalBreak > 0 && (
                        <p className="text-[11px] text-amber-300/80 flex items-center sm:justify-end gap-1 mt-0.5">
                          <Coffee size={11} /> {breaks.length} break{breaks.length > 1 ? 's' : ''} ({formatDuration(totalBreak)})
                        </p>
                      )}
                    </div>

                    {hasBreaks && (
                      <button
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
                        title="Toggle break breakdown"
                        aria-label="Toggle break breakdown"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Break Breakdown */}
                {isExpanded && hasBreaks && (
                  <div className="mt-4 pt-3 border-t border-slate-700/60 space-y-2 bg-slate-900/40 -mx-6 -mb-6 p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Coffee size={13} className="text-amber-400" /> Breaks Recorded:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {breaks.map((b, idx) => {
                        const bStart = b.startedAt ? formatTime(b.startedAt) : '—';
                        const bEnd = b.endedAt ? formatTime(b.endedAt) : 'In progress';
                        const durationMins = (b.startedAt && b.endedAt)
                          ? Math.max(0, Math.floor((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 60000))
                          : 0;

                        return (
                          <div
                            key={b._id || idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs"
                          >
                            <span className="capitalize text-slate-300 font-medium">
                              #{idx + 1} {b.type || 'personal'} break
                            </span>
                            <span className="text-slate-400">
                              {bStart} – {bEnd} <strong className="text-amber-400 ml-1">({durationMins}m)</strong>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

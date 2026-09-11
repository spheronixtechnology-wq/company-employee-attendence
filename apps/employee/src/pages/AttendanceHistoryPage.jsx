import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Calendar, Coffee,
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
    present: { label: 'Present', cls: 'bg-emerald-50 text-emerald-600' },
    half_day: { label: 'Half Day', cls: 'bg-amber-50 text-amber-600' },
    absent: { label: 'Absent', cls: 'bg-rose-50 text-rose-600' },
    leave: { label: 'On Leave', cls: 'bg-sky-50 text-sky-600' },
    incomplete: { label: 'Incomplete', cls: 'bg-slate-100 text-slate-500' },
    manual_pending: { label: 'Pending Approval', cls: 'bg-violet-50 text-violet-600' },
  };

  const item = config[status] || { label: status || 'Pending', cls: 'bg-slate-100 text-slate-500' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${item.cls}`}>
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

  const statVariants = [
    { label: 'text-slate-500', value: 'text-slate-800', chip: 'from-slate-100 to-slate-50 text-slate-500' },
    { label: 'text-emerald-500', value: 'text-emerald-600', chip: 'from-emerald-100 to-emerald-50 text-emerald-500' },
    { label: 'text-amber-500', value: 'text-amber-600', chip: 'from-amber-100 to-amber-50 text-amber-500' },
    { label: 'text-violet-500', value: 'text-violet-600', chip: 'from-violet-100 to-violet-50 text-violet-500' },
  ];

  return (
    <div className="relative page-container max-w-3xl mx-auto space-y-6 pb-12">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2.5">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title text-slate-800">Attendance History</h1>
            <p className="text-slate-400 text-sm mt-0.5">Track your past shifts, work hours, and breaks</p>
          </div>
        </div>
        <button
          onClick={fetchAttendance}
          disabled={loading}
          className="p-2.5 rounded-2xl bg-white/80 border border-white/90 text-slate-500 hover:text-violet-600 hover:shadow-[0_6px_16px_-8px_rgba(139,92,246,0.5)] shadow-[0_4px_14px_-8px_rgba(148,163,184,0.5)] transition-all"
          title="Refresh attendance"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary Stat Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Days', value: summary.totalDays, sub: 'Recorded shifts', v: statVariants[0] },
            { label: 'Present', value: summary.presentCount, sub: 'Full shifts', v: statVariants[1] },
            { label: 'Half Day', value: summary.halfDayCount, sub: 'Short shifts', v: statVariants[2] },
            { label: 'Total Hours', value: `${summary.totalHours}h`, sub: 'Net productive', v: statVariants[3] },
          ].map((s, i) => (
            <div key={i} className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-4 text-center shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)]">
              <p className={`text-xs font-semibold ${s.v.label}`}>{s.label}</p>
              <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${s.v.value}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Attendance List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="animate-spin text-violet-400 mb-3" size={32} />
          <p className="text-slate-400 text-sm">Loading attendance records...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 text-center py-12 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45)]">
          <div className="w-14 h-14 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-400 flex items-center justify-center">
            <Calendar size={26} />
          </div>
          <h3 className="text-slate-700 font-semibold text-base mb-1">No attendance records found</h3>
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
                className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 shadow-[0_10px_28px_-14px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_16px_36px_-14px_rgba(148,163,184,0.65)] transition-all overflow-hidden"
              >
                {/* Main Card Row */}
                <div
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  onClick={() => hasBreaks && toggleExpand(rec._id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-800 font-bold text-base">{formatDate(rec.date)}</span>
                      <StatusBadge status={rec.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1 text-slate-500">
                        <LogIn size={13} className="text-emerald-500" />
                        {rec.checkInTime ? formatTime(rec.checkInTime) : 'No check-in'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <LogOut size={13} className="text-rose-400" />
                        {rec.checkOutTime ? (
                          formatTime(rec.checkOutTime)
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Session in progress
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-violet-50 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center sm:justify-end gap-1.5 text-sm font-bold text-slate-800">
                        <Timer size={14} className="text-violet-500" />
                        <span className="font-mono tabular-nums">{totalWork > 0 ? formatDuration(totalWork) : '0m'}</span>
                      </div>
                      {totalBreak > 0 && (
                        <p className="text-[11px] text-amber-500 flex items-center sm:justify-end gap-1 mt-0.5">
                          <Coffee size={11} /> {breaks.length} break{breaks.length > 1 ? 's' : ''} ({formatDuration(totalBreak)})
                        </p>
                      )}
                    </div>

                    {hasBreaks && (
                      <button
                        className="text-slate-400 hover:text-violet-600 p-1.5 rounded-xl hover:bg-violet-50 transition-colors"
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
                  <div className="mt-1 pt-4 border-t border-violet-50 space-y-2 bg-violet-50/30 p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Coffee size={13} className="text-amber-500" /> Breaks Recorded:
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
                            className="flex items-center justify-between p-2.5 rounded-2xl bg-white/80 border border-violet-50 text-xs shadow-[0_2px_8px_-4px_rgba(148,163,184,0.4)]"
                          >
                            <span className="capitalize text-slate-600 font-medium">
                              #{idx + 1} {b.type || 'personal'} break
                            </span>
                            <span className="text-slate-400">
                              {bStart} – {bEnd} <strong className="text-amber-500 ml-1">({durationMins}m)</strong>
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

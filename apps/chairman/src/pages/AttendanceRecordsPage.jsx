import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, ClipboardList, Clock, Calendar, CheckCircle2, XCircle,
  Search, RefreshCw, Filter, Users, ArrowLeft, ArrowRight,
  AlertTriangle, Check, X, Sparkles, UserCheck, UserX,
  ChevronDown, ArrowUpRight, ShieldCheck, Zap, FileText
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import MonthCalendar from '../components/timechamp/MonthCalendar';

export default function AttendanceRecordsPage() {
  const [searchParams] = useSearchParams();
  const qDate = searchParams.get('date');
  const qFilter = searchParams.get('filter') || searchParams.get('status');

  const [records, setRecords] = useState([]);
  const [activeDates, setActiveDates] = useState([]);
  const [teams, setTeams] = useState([]);
  const [date, setDate] = useState(() => qDate || new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => {
    if (['attended', 'present'].includes(qFilter)) return 'attended';
    if (['not_attended', 'absent'].includes(qFilter)) return 'not_attended';
    if (['pending', 'review'].includes(qFilter)) return 'pending';
    if (['missing_logs', 'missing'].includes(qFilter)) return 'missing_logs';
    return 'all';
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const { socket } = useSocket();

  useEffect(() => {
    const paramDate = searchParams.get('date');
    const paramFilter = searchParams.get('filter') || searchParams.get('status');
    if (paramDate && paramDate !== date) {
      setDate(paramDate);
    }
    if (paramFilter) {
      if (['attended', 'present'].includes(paramFilter)) setStatusFilter('attended');
      else if (['not_attended', 'absent'].includes(paramFilter)) setStatusFilter('not_attended');
      else if (['pending', 'review'].includes(paramFilter)) setStatusFilter('pending');
      else if (['missing_logs', 'missing'].includes(paramFilter)) setStatusFilter('missing_logs');
      else if (paramFilter === 'all') setStatusFilter('all');
    }
  }, [searchParams]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const teamParam = selectedTeam !== 'all' ? `&teamId=${selectedTeam}` : '';
      const roleParam = selectedRole !== 'all' ? `&role=${selectedRole}` : '';
      const res = await api.get(`/admin/attendance?date=${date}${teamParam}${roleParam}`);
      const data = res.data?.data;
      setRecords(data?.attendance || []);
      if (Array.isArray(data?.activeDatesInMonth)) {
        setActiveDates(data.activeDatesInMonth);
      }
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
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${dayNum}`);
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

  // Helper classifiers
  const isAttended = useCallback((rec) => {
    return ['present', 'half_day'].includes(rec.status) || Boolean(rec.checkInTime);
  }, []);

  const isManualPending = useCallback((rec) => {
    return rec.status === 'manual_pending' || rec.manualRequest?.status === 'pending';
  }, []);

  const isNotAttended = useCallback((rec) => {
    if (isAttended(rec)) return false;
    if (isManualPending(rec)) return false;
    return true;
  }, [isAttended, isManualPending]);

  const isMissingLog = useCallback((rec) => {
    return isAttended(rec) && !rec.dailyLogSubmitted;
  }, [isAttended]);

  // Overall counts
  const totalEmployees = records.length;
  const attendedCount = records.filter(isAttended).length;
  const notAttendedCount = records.filter(isNotAttended).length;
  const manualPendingCount = records.filter(isManualPending).length;
  const missingLogCount = records.filter(isMissingLog).length;
  const turnoutPct = totalEmployees > 0 ? Math.round((attendedCount / totalEmployees) * 100) : 0;

  // Filter records by search term and status tab
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Status filter tab
      if (statusFilter === 'attended' && !isAttended(rec)) return false;
      if (statusFilter === 'not_attended' && !isNotAttended(rec)) return false;
      if (statusFilter === 'pending' && !isManualPending(rec)) return false;
      if (statusFilter === 'missing_logs' && !isMissingLog(rec)) return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = rec.userId?.name?.toLowerCase() || '';
      const email = rec.userId?.email?.toLowerCase() || '';
      const designation = rec.userId?.designation?.toLowerCase() || '';
      const teamName = rec.userId?.teamId?.name?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || designation.includes(q) || teamName.includes(q);
    });
  }, [records, statusFilter, search, isAttended, isNotAttended, isManualPending, isMissingLog]);

  // Formatted date string for selected date
  const formattedDate = useMemo(() => {
    if (!date) return '';
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [date]);

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
    <div className="page-container space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary-500/25 flex-shrink-0">
            <ClipboardList size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Attendance Records
            </h1>
            <p className="text-slate-500 text-xs mt-0.5 font-medium">
              Interactive calendar-based company attendance monitoring and daily employee records.
            </p>
          </div>
        </div>

        {/* Date Stepper / Jump to Today */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-200/80 p-1.5 rounded-2xl shadow-sm self-start md:self-auto hover:border-slate-300 transition-all">
          <button
            type="button"
            onClick={() => handleDateShift(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Previous day"
          >
            <ArrowLeft size={16} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-slate-900 text-xs font-bold px-2 py-1 outline-none border-none cursor-pointer tracking-wide"
          />
          <button
            type="button"
            onClick={() => handleDateShift(1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Next day"
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDate(new Date().toISOString().split('T')[0])}
            className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:opacity-95 transition-all hover:scale-105 active:scale-95 shadow-sm shadow-primary-500/20 ml-1 cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in shadow-sm ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/90 border-rose-200 text-rose-900'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* 2-Column Grid Layout: Left Sticky Calendar | Right Scrollable Attendance Records */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Month Calendar & Day Turnout Summary Widget  */}
        {/* (Sticky on desktop so it stays pinned while right scrolls)*/}
        {/* ========================================================= */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          {/* Interactive Month Calendar */}
          <MonthCalendar
            selectedDate={date}
            onSelectDate={(newDate) => setDate(newDate)}
            activeDates={activeDates}
          />

          {/* Selected Day Turnout Summary Card */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Date</p>
                <p className="text-sm font-black text-slate-900 mt-0.5">{formattedDate}</p>
              </div>
              <span className={`text-xs font-black px-3 py-1 rounded-full border shadow-2xs ${
                turnoutPct >= 50
                  ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {turnoutPct}% Turnout
              </span>
            </div>

            {/* Turnout Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-500">
                <span>Staff Attendance Ratio</span>
                <span className="font-bold text-slate-700">{attendedCount} of {totalEmployees} present</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                  style={{ width: `${totalEmployees > 0 ? (attendedCount / totalEmployees) * 100 : 0}%` }}
                  title={`Attended: ${attendedCount}`}
                />
                <div
                  className="bg-gradient-to-r from-rose-400 to-pink-500 h-full transition-all duration-500"
                  style={{ width: `${totalEmployees > 0 ? (notAttendedCount / totalEmployees) * 100 : 0}%` }}
                  title={`Not Attended: ${notAttendedCount}`}
                />
              </div>
            </div>

            {/* Breakdown Quick-Filter Cards: Green Attended vs Red Not Attended */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Attended (Green) */}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'attended' ? 'all' : 'attended')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  statusFilter === 'attended'
                    ? 'bg-gradient-to-br from-emerald-100/90 via-emerald-50 to-teal-50 border-emerald-500 ring-2 ring-emerald-300 shadow-md scale-[1.02]'
                    : 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/30 border-emerald-200/80 hover:border-emerald-300 hover:shadow-sm hover:scale-[1.02]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-900">Attended</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-emerald-700 mt-1 tracking-tight">{attendedCount}</p>
                <p className="text-[10px] text-emerald-600 font-semibold">Present / Half-day</p>
              </button>

              {/* Not Attended (Red) */}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'not_attended' ? 'all' : 'not_attended')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  statusFilter === 'not_attended'
                    ? 'bg-gradient-to-br from-rose-100/90 via-rose-50 to-pink-50 border-rose-500 ring-2 ring-rose-300 shadow-md scale-[1.02]'
                    : 'bg-gradient-to-br from-rose-50/70 via-white to-pink-50/30 border-rose-200/80 hover:border-rose-300 hover:shadow-sm hover:scale-[1.02]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-900">Not Attended</span>
                  <XCircle size={16} className="text-rose-600" />
                </div>
                <p className="text-2xl font-black text-rose-700 mt-1 tracking-tight">{notAttendedCount}</p>
                <p className="text-[10px] text-rose-600 font-semibold">Absent / Not in</p>
              </button>
            </div>

            {/* Manual Review Pending (Amber) if any */}
            {manualPendingCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-300 shadow-md'
                    : 'bg-gradient-to-r from-amber-50 via-white to-orange-50/40 border-amber-200/80 hover:border-amber-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle size={17} className="text-amber-600 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-amber-900">Manual Review Pending</span>
                    <p className="text-[10px] text-amber-700 font-medium">Requires Admin Approval</p>
                  </div>
                </div>
                <span className="text-sm font-black text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-xl">
                  {manualPendingCount}
                </span>
              </button>
            )}

            {/* Missing Daily Logs (Purple) if any */}
            {missingLogCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'missing_logs' ? 'all' : 'missing_logs')}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 cursor-pointer ${
                  statusFilter === 'missing_logs'
                    ? 'bg-purple-100/90 border-purple-500 ring-2 ring-purple-300 shadow-md'
                    : 'bg-gradient-to-r from-purple-50 via-white to-indigo-50/40 border-purple-200/80 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText size={17} className="text-purple-600 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-purple-900">Missing Daily Logs</span>
                    <p className="text-[10px] text-purple-700 font-medium">Checked in without EOD report</p>
                  </div>
                </div>
                <span className="text-sm font-black text-purple-800 bg-purple-200/80 px-2.5 py-0.5 rounded-xl">
                  {missingLogCount}
                </span>
              </button>
            )}

            {/* Tip Banner */}
            <div className="text-[11px] text-slate-500 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/60 leading-relaxed flex items-start gap-2">
              <Sparkles size={15} className="text-primary-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Smart Calendar:</strong> Click any date with an emerald dot to inspect that day's verified attendance ledger.
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Toolbar & Dedicated Scrollable Employee List */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 space-y-4">
          {/* Top Filter & Toolbar Card */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-3.5">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* All Staff Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-[1.02]'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Staff ({totalEmployees})
                </button>

                {/* Attended (Green) Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('attended')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    statusFilter === 'attended'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]'
                      : 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-200/80'
                  }`}
                >
                  <CheckCircle2 size={14} />
                  Attended ({attendedCount})
                </button>

                {/* Not Attended (Red) Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('not_attended')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    statusFilter === 'not_attended'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/25 scale-[1.02]'
                      : 'bg-rose-50 hover:bg-rose-100/80 text-rose-700 border border-rose-200/80'
                  }`}
                >
                  <XCircle size={14} />
                  Not Attended ({notAttendedCount})
                </button>

                {/* Missing Daily Logs (Purple) Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('missing_logs')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    statusFilter === 'missing_logs'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25 scale-[1.02]'
                      : 'bg-purple-50 hover:bg-purple-100/80 text-purple-700 border border-purple-200/80'
                  }`}
                >
                  <FileText size={14} />
                  Missing Logs ({missingLogCount})
                </button>

                {/* Pending Tab */}
                {manualPendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                      statusFilter === 'pending'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25 scale-[1.02]'
                        : 'bg-amber-50 hover:bg-amber-100/80 text-amber-800 border border-amber-200/80'
                    }`}
                  >
                    <AlertTriangle size={14} />
                    Pending ({manualPendingCount})
                  </button>
                )}
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={fetchAttendance}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                title="Refresh attendance data"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin text-primary-600' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Search Bar & Dropdown Selectors */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employee by name, email or role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-10 pr-8 text-xs py-2 w-full border-slate-200 bg-white text-slate-900 shadow-2xs rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Dropdowns */}
              <div className="flex items-center gap-2">
                {/* Team Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs hover:border-slate-300 transition-all">
                  <Filter size={13} className="text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">Team:</span>
                  <select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="all">All Teams</option>
                    {teams.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs hover:border-slate-300 transition-all">
                  <Users size={13} className="text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">Role:</span>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="all">All Staff</option>
                    <option value="employee">Employees</option>
                    <option value="manager">Managers</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* List Status Summary Bar */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
            <span>
              Showing <strong className="text-slate-800">{filteredRecords.length}</strong> staff member{filteredRecords.length !== 1 ? 's' : ''} for {formattedDate}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> {attendedCount} Attended
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> {notAttendedCount} Not Attended
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* SCROLLABLE CONTAINER FOR EMPLOYEE ATTENDANCE CARDS        */}
          {/* ========================================================= */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-sm">
              <Loader2 className="animate-spin text-primary-600 mb-3" size={34} />
              <p className="text-xs font-bold text-slate-700">Loading attendance records for {date}...</p>
              <p className="text-[11px] text-slate-400 mt-1">Fetching live check-ins and session details</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="card text-center py-16 border border-slate-200/80 bg-white/95 shadow-sm rounded-2xl">
              <ClipboardList className="mx-auto text-slate-300 mb-2.5" size={42} />
              <p className="text-sm font-bold text-slate-800">No attendance records match criteria</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No staff members found for the selected date ({date}) with the applied filter settings.
              </p>
              {(statusFilter !== 'all' || search.trim() || selectedTeam !== 'all' || selectedRole !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSearch('');
                    setSelectedTeam('all');
                    setSelectedRole('all');
                  }}
                  className="mt-4 px-3.5 py-1.5 text-xs font-black text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200 transition-all hover:scale-105 cursor-pointer shadow-2xs"
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-275px)] min-h-[460px] pr-2 custom-scrollbar pb-6">
              {filteredRecords.map((rec) => {
                const attended = isAttended(rec);
                const manualPending = isManualPending(rec);
                const notAttended = !attended && !manualPending;
                const hasManualReq = Boolean(rec.manualRequest && rec.manualRequest._id);

                // Container styling: Green accent for attended, Red accent for not attended, Amber for pending
                let cardClass =
                  'group p-4 transition-all duration-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.09)] hover:-translate-y-0.5';

                if (attended) {
                  cardClass +=
                    ' bg-gradient-to-r from-emerald-500/[0.04] via-white to-white border border-slate-200/90 border-l-[5px] border-l-emerald-500 hover:border-emerald-300';
                } else if (manualPending) {
                  cardClass +=
                    ' bg-gradient-to-r from-amber-500/[0.06] via-amber-50/30 to-white border border-amber-300/90 border-l-[5px] border-l-amber-500 ring-1 ring-amber-200/80 hover:border-amber-400';
                } else {
                  cardClass +=
                    ' bg-gradient-to-r from-rose-500/[0.04] via-white to-white border border-slate-200/90 border-l-[5px] border-l-rose-500 hover:border-rose-300';
                }

                return (
                  <div key={rec._id || rec.userId?._id} className={cardClass}>
                    {/* Employee Profile Info */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Avatar with dynamic status indicator ring */}
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 border shadow-2xs transition-transform group-hover:scale-105 ${
                          attended
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-2 ring-emerald-400/30'
                            : manualPending
                            ? 'bg-amber-50 text-amber-700 border-amber-200 ring-2 ring-amber-400/30'
                            : 'bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-400/30'
                        }`}
                      >
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
                          <span className="font-extrabold text-slate-900 text-sm truncate">
                            {rec.userId?.name || 'Unknown Staff'}
                          </span>

                          {/* Manager badge */}
                          {rec.userId?.role === 'manager' && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-200 shadow-2xs">
                              MANAGER
                            </span>
                          )}

                          {/* Team Name badge */}
                          {rec.userId?.teamId?.name && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                              {rec.userId.teamId.name}
                            </span>
                          )}

                          {/* Check-in Method badge */}
                          {rec.checkInMethod && (
                            <span className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-[10px] font-bold border border-primary-200/80 flex items-center gap-1">
                              <Zap size={10} className="text-primary-600" />
                              {formatMethod(rec.checkInMethod)}
                            </span>
                          )}
                        </div>

                        <p className="text-slate-500 text-xs font-medium truncate">
                          {rec.userId?.designation ||
                            (rec.userId?.role === 'manager' ? 'Team Manager' : rec.userId?.email || 'Staff Member')}
                        </p>

                        {/* Pending Manual Review Reason Card */}
                        {manualPending && rec.manualRequest?.reason && (
                          <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 text-xs text-amber-900 mt-2 shadow-2xs">
                            <span className="font-extrabold text-amber-800 flex items-center gap-1.5 mb-1">
                              <AlertTriangle size={13} className="text-amber-600" /> Manual Attendance Request Reason:
                            </span>
                            <p className="italic text-slate-700 font-medium">"{rec.manualRequest.reason}"</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shift Timings & Status Section */}
                    <div className="flex items-center gap-4 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                      {/* Timings */}
                      <div className="text-left md:text-right space-y-0.5">
                        {attended ? (
                          <>
                            <p className="text-xs text-slate-700 font-medium flex items-center md:justify-end gap-1.5">
                              <Clock size={12} className="text-emerald-600" />
                              <span>In: <strong className="text-slate-900 font-black">{formatTime(rec.checkInTime)}</strong></span>
                              {rec.checkOutTime && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span>Out: <strong className="text-slate-900 font-black">{formatTime(rec.checkOutTime)}</strong></span>
                                </>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold">
                              {rec.totalWorkMinutes
                                ? `Net Work: ${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m`
                                : rec.checkInTime && !rec.checkOutTime
                                ? 'Active now'
                                : 'Session recorded'}
                            </p>
                            {rec.checkInLocation && rec.checkInLocation.lat && rec.checkInLocation.lng && (
                              <div className="text-[11px] text-slate-500 font-semibold flex items-center md:justify-end gap-1 mt-0.5">
                                <span>📍</span>
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${rec.checkInLocation.lat},${rec.checkInLocation.lng}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary-600 hover:underline"
                                  title="View on Map"
                                >
                                  {rec.checkInLocation.lat.toFixed(6)}, {rec.checkInLocation.lng.toFixed(6)}
                                </a>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-slate-400 font-medium italic">
                              In: — (No session recorded)
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium">
                              Net Work: 0h 0m
                            </p>
                          </>
                        )}
                      </div>

                      {/* Status / Actions Badge */}
                      {manualPending && hasManualReq ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleManualDecision(rec.manualRequest._id, 'approve')}
                            disabled={Boolean(processingId)}
                            className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-sm shadow-emerald-600/25 cursor-pointer"
                          >
                            {processingId === rec.manualRequest._id + 'approve' ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                            Approve
                          </button>

                          <button
                            type="button"
                            onClick={() => handleManualDecision(rec.manualRequest._id, 'reject')}
                            disabled={Boolean(processingId)}
                            className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-sm shadow-rose-600/25 cursor-pointer"
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
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                          {attended && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-2xs ${
                              rec.dailyLogSubmitted
                                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border-emerald-200'
                                : 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-800 border-purple-200'
                            }`}>
                              <FileText size={12} className={rec.dailyLogSubmitted ? 'text-emerald-600' : 'text-purple-600'} />
                              {rec.dailyLogSubmitted ? `Log Filed (${rec.hoursSpent || 0}h)` : 'No Daily Log'}
                            </span>
                          )}

                          {/* Standard Green / Red / Amber Status Badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full font-black border shadow-2xs transition-all ${
                              attended
                                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-800'
                                : manualPending
                                ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-800'
                                : 'bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200 text-rose-800'
                            }`}
                          >
                            {attended ? (
                              <>
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                {rec.status === 'half_day' ? 'Half Day' : 'Present'}
                              </>
                            ) : manualPending ? (
                              <>
                                <AlertTriangle size={14} className="text-amber-600" />
                                Pending Review
                              </>
                            ) : (
                              <>
                                <XCircle size={14} className="text-rose-600" />
                                {rec.status === 'absent' ? 'Absent' : 'Not Checked In'}
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

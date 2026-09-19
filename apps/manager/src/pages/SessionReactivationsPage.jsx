import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert, CheckCircle2, XCircle, Clock, AlertTriangle,
  Search, Calendar as CalendarIcon, RefreshCw, Loader2,
  Check, X, UserCheck
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

export default function SessionReactivationsPage() {
  const { socket } = useSocket();

  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  });
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    kpis: { totalAutoCheckedOut: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 },
    records: [],
  });

  // Action modal state
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' | 'reject'
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/session-reactivations?date=${date}&search=${encodeURIComponent(search)}`);
      if (res.data?.success && res.data?.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch session reactivations:', err);
    } finally {
      setLoading(false);
    }
  }, [date, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Real-time listener for incoming reactivation requests & decisions
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchRecords();
    socket.on('reactivation:requested', handleUpdate);
    socket.on('attendance:update', handleUpdate);
    socket.on('attendance:reactivated', handleUpdate);
    socket.on('attendance:reactivation_rejected', handleUpdate);
    return () => {
      socket.off('reactivation:requested', handleUpdate);
      socket.off('attendance:update', handleUpdate);
      socket.off('attendance:reactivated', handleUpdate);
      socket.off('attendance:reactivation_rejected', handleUpdate);
    };
  }, [socket, fetchRecords]);

  const filteredRecords = useMemo(() => {
    if (!data.records) return [];
    if (activeFilter === 'all') return data.records;
    if (activeFilter === 'pending') {
      return data.records.filter((r) => r.reactivationStatus === 'pending');
    }
    if (activeFilter === 'approved') {
      return data.records.filter((r) => r.reactivationStatus === 'approved');
    }
    if (activeFilter === 'rejected') {
      return data.records.filter((r) => r.reactivationStatus === 'rejected');
    }
    return data.records;
  }, [data.records, activeFilter]);

  const isPast6PmToday = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (date < todayStr) return true; // Past dates cannot be reactivated
    if (date > todayStr) return false;
    const now = new Date();
    const shiftEnd = new Date(`${todayStr}T18:00:00.000+05:30`);
    return now.getTime() >= shiftEnd.getTime();
  }, [date]);

  const handleOpenActionModal = (record, action) => {
    setSelectedRecord(record);
    setActionType(action);
    setDecisionNotes('');
    setActionMessage(null);
  };

  const handleCloseActionModal = () => {
    setSelectedRecord(null);
    setActionType(null);
    setDecisionNotes('');
    setActionMessage(null);
  };

  const handleConfirmDecision = async () => {
    if (!selectedRecord || !actionType) return;
    setSubmitting(true);
    setActionMessage(null);
    const completedAction = actionType;

    try {
      const endpoint = `/manager/session-reactivations/${selectedRecord._id}/decision`;

      const res = await api.post(endpoint, {
        action: actionType,
        decision: actionType,
        notes: decisionNotes.trim() || undefined,
      });

      if (res.data?.success) {
        setActionMessage({
          type: 'success',
          text:
            actionType === 'approve'
              ? `Successfully reactivated session for ${selectedRecord.userId?.name || 'employee'}.`
              : `Successfully closed session for ${selectedRecord.userId?.name || 'employee'}.`,
        });

        // Switch to the appropriate tab so the manager immediately sees the updated record
        if (completedAction === 'approve') {
          setActiveFilter('approved');
        } else if (completedAction === 'reject') {
          setActiveFilter('rejected');
        }

        setTimeout(() => {
          handleCloseActionModal();
          fetchRecords();
        }, 800);
      } else {
        setActionMessage({
          type: 'error',
          text: res.data?.message || 'Action failed. Please try again.',
        });
      }
    } catch (err) {
      console.error('Action error:', err);
      if (err.response?.data?.code === 'ALREADY_ACTIVE' || err.response?.data?.message?.includes('already active')) {
        setActionMessage({
          type: 'success',
          text: `Session for ${selectedRecord.userId?.name || 'employee'} is already active and resumed.`,
        });
        setActiveFilter('approved');
        setTimeout(() => {
          handleCloseActionModal();
          fetchRecords();
        }, 800);
      } else {
        setActionMessage({
          type: 'error',
          text: err.response?.data?.message || 'Server error occurred.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Session Reactivations</h1>
              <p className="text-xs text-slate-500">Review auto-checked out accounts, verify reasons, and resume sessions</p>
            </div>
          </div>
        </div>

        {/* Date & Refresh */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <CalendarIcon size={14} className="text-slate-400 mr-2" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 shadow-xs transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-violet-600' : ''} />
          </button>
        </div>
      </div>

      {/* 6:00 PM Cutoff Alert Banner */}
      {isPast6PmToday && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 flex items-center gap-3 text-amber-900 text-xs font-medium shadow-xs">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
          <div>
            <strong className="font-bold">Shift Closed (6:00 PM IST):</strong> Attendance sessions cannot be reactivated after 6:00 PM IST. All accounts are automatically closed for today.
          </div>
        </div>
      )}

      {/* ── KPI Ribbon (Clickable Interactive Cards) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Auto-Checked Out */}
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`text-left rounded-2xl border p-4 shadow-xs transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer group ${
            activeFilter === 'all'
              ? 'bg-gradient-to-br from-violet-50/80 to-white border-violet-400 ring-2 ring-violet-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-violet-300'
          }`}
          title="Click to view all auto-checked out records"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 group-hover:text-violet-700 transition-colors">Auto-Checked Out</p>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              activeFilter === 'all' ? 'bg-violet-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 group-hover:bg-violet-100 group-hover:text-violet-700'
            }`}>
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{data.kpis.totalAutoCheckedOut}</p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[11px] text-slate-400">Team members out-of-bounds</p>
            {activeFilter === 'all' && (
              <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.2 rounded-md">Selected</span>
            )}
          </div>
        </button>

        {/* Pending Review */}
        <button
          type="button"
          onClick={() => setActiveFilter('pending')}
          className={`text-left rounded-2xl border p-4 shadow-xs transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer relative overflow-hidden group ${
            activeFilter === 'pending'
              ? 'bg-gradient-to-br from-amber-50 to-white border-amber-400 ring-2 ring-amber-400/50 shadow-sm'
              : 'bg-white border-amber-200 hover:border-amber-400 hover:bg-amber-50/20'
          }`}
          title="Click to view pending reactivation requests"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-800 group-hover:text-amber-900 transition-colors">Pending Review</p>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              activeFilter === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'bg-amber-100 text-amber-700 group-hover:bg-amber-200'
            }`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-black text-amber-700">{data.kpis.pendingCount}</p>
            {data.kpis.pendingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[11px] text-amber-600">Awaiting your approval</p>
            {activeFilter === 'pending' && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.2 rounded-md">Selected</span>
            )}
          </div>
        </button>

        {/* Approved & Resumed */}
        <button
          type="button"
          onClick={() => setActiveFilter('approved')}
          className={`text-left rounded-2xl border p-4 shadow-xs transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer group ${
            activeFilter === 'approved'
              ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-400 ring-2 ring-emerald-400/50 shadow-sm'
              : 'bg-white border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/20'
          }`}
          title="Click to view approved active sessions"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-800 group-hover:text-emerald-900 transition-colors">Approved & Resumed</p>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              activeFilter === 'approved' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200'
            }`}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{data.kpis.approvedCount}</p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[11px] text-emerald-600">Session resumed live</p>
            {activeFilter === 'approved' && (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/80 px-1.5 py-0.2 rounded-md">Selected</span>
            )}
          </div>
        </button>

        {/* Rejected / Closed */}
        <button
          type="button"
          onClick={() => setActiveFilter('rejected')}
          className={`text-left rounded-2xl border p-4 shadow-xs transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer group ${
            activeFilter === 'rejected'
              ? 'bg-gradient-to-br from-rose-50 to-white border-rose-400 ring-2 ring-rose-400/50 shadow-sm'
              : 'bg-white border-rose-200 hover:border-rose-400 hover:bg-rose-50/20'
          }`}
          title="Click to view closed/rejected sessions"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-rose-800 group-hover:text-rose-900 transition-colors">Closed for Today</p>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              activeFilter === 'rejected' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-100 text-rose-700 group-hover:bg-rose-200'
            }`}>
              <XCircle size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-700 mt-2">{data.kpis.rejectedCount}</p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[11px] text-rose-600">Reactivation rejected</p>
            {activeFilter === 'rejected' && (
              <span className="text-[10px] font-bold text-rose-800 bg-rose-200/80 px-1.5 py-0.2 rounded-md">Selected</span>
            )}
          </div>
        </button>
      </div>

      {/* ── Filters & Search ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'all', label: 'All', count: data.records?.length || 0 },
            { id: 'pending', label: 'Pending Review', count: data.kpis.pendingCount, badgeColor: 'bg-amber-100 text-amber-800 border-amber-300' },
            { id: 'approved', label: 'Approved', count: data.kpis.approvedCount },
            { id: 'rejected', label: 'Rejected', count: data.kpis.rejectedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeFilter === tab.id
                    ? 'bg-white/20 text-white'
                    : tab.badgeColor || 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search member name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>
      </div>

      {/* ── Records List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200">
          <Loader2 size={32} className="animate-spin text-violet-600 mb-3" />
          <p className="text-xs text-slate-500 font-medium">Loading session reactivations...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Records Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {activeFilter === 'pending'
              ? 'No pending session reactivation requests from your team.'
              : 'There are no auto-checkout records matching the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const employee = record.userId;
            const isPending = record.reactivationStatus === 'pending';
            const isApproved = record.reactivationStatus === 'approved';
            const isRejected = record.reactivationStatus === 'rejected';

            return (
              <div
                key={record._id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs hover:shadow-md ${
                  isPending
                    ? 'border-amber-300 ring-1 ring-amber-200/50 bg-amber-50/20'
                    : isApproved
                    ? 'border-emerald-200'
                    : isRejected
                    ? 'border-rose-200'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Employee Info */}
                  <div className="flex items-start gap-3.5 min-w-[280px]">
                    {employee?.avatarUrl ? (
                      <img
                        src={employee.avatarUrl}
                        alt={employee.name}
                        className="w-11 h-11 rounded-2xl object-cover ring-2 ring-slate-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-xs">
                        {employee?.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm">{employee?.name || 'Unknown Team Member'}</h3>
                        {employee?.designation && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {employee.designation}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{employee?.email}</p>
                      
                      {/* Attendance Punch Timestamps */}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-600">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-emerald-500" />
                          Punch In: <strong>{formatTime(record.checkInTime)}</strong>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-1">
                          <AlertTriangle size={12} className="text-amber-500" />
                          Auto-Checked Out: <strong>{formatTime(record.autoCheckoutAt || record.checkOutTime)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Trigger & Employee Submitted Explanation */}
                  <div className="flex-1 max-w-xl bg-slate-50 rounded-xl p-3.5 border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        {record.autoCheckoutReason === 'PRESENCE_VALIDATION_FAILED'
                          ? 'Presence Silence / Outside Bounds'
                          : record.autoCheckoutReason}
                      </span>
                      {record.reactivationRequestedAt && (
                        <span className="text-[10px] text-slate-400">
                          Requested: {formatTime(record.reactivationRequestedAt)}
                        </span>
                      )}
                    </div>
                    
                    {record.outOfBoundsReason ? (
                      <div className="text-xs text-slate-800">
                        <span className="font-bold text-slate-500">Employee Explanation: </span>
                        <span className="italic font-medium">"{record.outOfBoundsReason}"</span>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700 italic flex items-center gap-1.5">
                        <Clock size={13} />
                        No explanation submitted yet by employee (Direct management action available).
                      </div>
                    )}

                    {/* Decision Notes & Auditing if already resolved */}
                    {(isApproved || isRejected) && (
                      <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500">
                          Decision by: <strong className="text-slate-700">{record.reactivationDecisionBy?.name || 'Manager'}</strong> at {formatTime(record.reactivationDecisionAt)}
                        </span>
                        {record.reactivationDecisionNotes && (
                          <span className="text-slate-600 italic truncate max-w-[200px]" title={record.reactivationDecisionNotes}>
                            Note: "{record.reactivationDecisionNotes}"
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status Badges & Action Buttons */}
                  <div className="flex lg:flex-col items-end justify-between lg:justify-center gap-2.5 flex-shrink-0">
                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenActionModal(record, 'approve')}
                          disabled={isPast6PmToday}
                          className={`px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all ${
                            isPast6PmToday
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow'
                          }`}
                          title={isPast6PmToday ? 'Reactivations closed after 6:00 PM IST' : 'Reactivate session'}
                        >
                          <Check size={14} /> {isPast6PmToday ? 'Closed (6 PM)' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => handleOpenActionModal(record, 'reject')}
                          className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : isApproved && record.isCurrentlyActive ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                          <CheckCircle2 size={13} /> Approved & Resumed
                        </span>
                        <p className="text-[10.5px] text-emerald-600 font-medium mt-1">
                          ● Live Session Active
                        </p>
                      </div>
                    ) : isRejected ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                          <XCircle size={13} /> Rejected / Closed
                        </span>
                        <p className="text-[10.5px] text-rose-500 font-medium mt-1">
                          Closed for Today
                        </p>
                      </div>
                    ) : (
                      /* Unsubmitted record or session auto-checked out again: Give Direct Management Action buttons */
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenActionModal(record, 'approve')}
                            disabled={isPast6PmToday}
                            className={`px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all ${
                              isPast6PmToday
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow'
                            }`}
                            title={isPast6PmToday ? 'Reactivations closed after 6:00 PM IST' : 'Reactivate session directly'}
                          >
                            <Check size={14} /> {isPast6PmToday ? 'Closed (6 PM)' : 'Reactivate'}
                          </button>
                          <button
                            onClick={() => handleOpenActionModal(record, 'reject')}
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
                            title="Close session permanently for today"
                          >
                            <X size={14} /> Close
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {record.rawReactivationStatus === 'approved' && !record.isCurrentlyActive
                            ? 'Auto-Checked Out Again (Reactivate)'
                            : 'Direct Management Action'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirmation Modal ── */}
      {selectedRecord && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    actionType === 'approve'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {actionType === 'approve' ? <UserCheck size={20} /> : <XCircle size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {actionType === 'approve' ? 'Reactivate Team Member Session' : 'Reject Reactivation'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Employee: {selectedRecord.userId?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseActionModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Explanation Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Submitted Reason:</p>
              <p className="text-slate-800 font-medium mt-0.5 italic">
                "{selectedRecord.outOfBoundsReason || 'No detailed reason provided.'}"
              </p>
            </div>

            {/* Impact Explanation */}
            <p className="text-xs text-slate-600 mb-4">
              {actionType === 'approve' ? (
                <>
                  Approving will <strong>resume this employee's active session</strong>. The suspended period will be accounted as non-working suspension time, maintaining accurate work duration.
                </>
              ) : (
                <>
                  Rejecting will <strong>permanently close this session for today</strong>. The employee will not be permitted to check in again until tomorrow.
                </>
              )}
            </p>

            {/* Review Note */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Management Note (Optional):
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder={
                  actionType === 'approve'
                    ? 'E.g., Approved — client site visit verified.'
                    : 'E.g., Rejected — absence not approved.'
                }
                rows={2}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            {actionMessage && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {actionMessage.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                onClick={handleConfirmDecision}
                disabled={submitting}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs flex items-center justify-center gap-2 ${
                  actionType === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submitting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : actionType === 'approve' ? (
                  'Confirm & Reactivate'
                ) : (
                  'Confirm & Reject'
                )}
              </button>
              <button
                onClick={handleCloseActionModal}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

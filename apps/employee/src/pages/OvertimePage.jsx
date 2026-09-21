import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Timer,
  Send, Play, Square, Loader2, FileText, Calendar,
  ChevronRight, RefreshCw, Info, Check, ShieldAlert, ArrowRight
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';

export default function OvertimePage() {
  const { socket } = useSocket();
  const [data, setData] = useState({ records: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Request Modal State
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '18:30',
    endTime: '20:30',
    reason: '',
  });

  // Finish OT Modal State
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [workDetails, setWorkDetails] = useState('');

  // Selected Record Modal
  const [viewRecord, setViewRecord] = useState(null);

  // History Tab Filter
  const [tabFilter, setTabFilter] = useState('all');

  // Live timer for active session
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fetchOvertime = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      setErrorMsg(null);
      const res = await api.get('/employee/overtime/me');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch overtime data:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load overtime records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOvertime();
  }, [fetchOvertime]);

  // Real-time sync: manager resolves overtime permission or work verification
  useEffect(() => {
    if (!socket) return;

    const onPermissionResolved = (payload) => {
      fetchOvertime(true);
      const approved = payload?.status === 'permission_approved';
      if (approved) {
        setSuccessMsg('✅ Your overtime permission request has been approved. You can now start your session.');
      } else {
        setErrorMsg(`❌ Your overtime request was rejected.${payload?.notes ? ` Note: ${payload.notes}` : ''}`);
      }
    };

    const onWorkResolved = (payload) => {
      fetchOvertime(true);
      const approved = payload?.status === 'completed_approved';
      if (approved) {
        setSuccessMsg('✅ Your overtime work has been verified and approved.');
      } else {
        setErrorMsg(`❌ Your overtime work submission was not approved.${payload?.notes ? ` Note: ${payload.notes}` : ''}`);
      }
    };

    socket.on('overtime:permission_resolved', onPermissionResolved);
    socket.on('overtime:work_resolved', onWorkResolved);

    return () => {
      socket.off('overtime:permission_resolved', onPermissionResolved);
      socket.off('overtime:work_resolved', onWorkResolved);
    };
  }, [socket, fetchOvertime]);

  // Active in-progress stopwatch
  const activeSession = data.stats?.activeSession;
  useEffect(() => {
    if (!activeSession?.actualStartTime) {
      setElapsedSeconds(0);
      return;
    }

    const startTs = new Date(activeSession.actualStartTime).getTime();
    const updateTimer = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startTs) / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const formatElapsed = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Submit Stage 1 Permission Request
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestForm.reason.trim()) {
      setErrorMsg('Please enter a clear reason for the overtime request.');
      return;
    }

    setActionLoading('request');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const startIso = new Date(`${requestForm.date}T${requestForm.startTime}:00`).toISOString();
      const endIso = new Date(`${requestForm.date}T${requestForm.endTime}:00`).toISOString();

      await api.post('/employee/overtime/request', {
        date: requestForm.date,
        requestedStartTime: startIso,
        requestedEndTime: endIso,
        reason: requestForm.reason,
      });

      setSuccessMsg('Overtime permission request submitted to your manager (Stage 1).');
      setRequestModalOpen(false);
      setRequestForm({
        date: new Date().toISOString().split('T')[0],
        startTime: '18:30',
        endTime: '20:30',
        reason: '',
      });
      fetchOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to submit overtime request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Start OT Session (only when permission_approved)
  const handleStartSession = async (sessionId) => {
    setActionLoading('start');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await api.post(`/employee/overtime/${sessionId}/start`);
      setSuccessMsg('Overtime session started! Your focus time is now being recorded.');
      fetchOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to start overtime session.');
    } finally {
      setActionLoading(null);
    }
  };

  // Finish OT Session & Submit Work (Stage 2 submission)
  const handleFinishSession = async (e) => {
    e.preventDefault();
    if (!workDetails.trim()) {
      setErrorMsg('Please describe the work completed during this overtime session.');
      return;
    }

    if (!activeSession) return;

    setActionLoading('finish');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await api.post(`/employee/overtime/${activeSession._id}/end`, {
        workDetails: workDetails.trim(),
      });

      setSuccessMsg('Overtime session finished and work submitted for manager verification (Stage 2).');
      setFinishModalOpen(false);
      setWorkDetails('');
      fetchOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to finish overtime session.');
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel Request
  const handleCancelRequest = async (sessionId) => {
    if (!window.confirm('Are you sure you want to cancel this overtime request?')) return;
    setActionLoading(`cancel_${sessionId}`);
    setErrorMsg(null);

    try {
      await api.post(`/employee/overtime/${sessionId}/cancel`);
      setSuccessMsg('Overtime request cancelled.');
      fetchOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to cancel overtime request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    const list = data.records || [];
    if (tabFilter === 'pending') {
      return list.filter((r) => ['permission_pending', 'work_verification_pending'].includes(r.status));
    }
    if (tabFilter === 'approved') {
      return list.filter((r) => r.status === 'completed_approved');
    }
    if (tabFilter === 'active') {
      return list.filter((r) => ['permission_approved', 'in_progress'].includes(r.status));
    }
    return list;
  }, [data.records, tabFilter]);

  const stats = data.stats || {};
  const permittedSession = stats.permittedSession;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin text-violet-500" />
        <p className="text-sm font-semibold text-slate-500">Loading Overtime Dashboard…</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      {/* ── Page Header ── */}
      <PageHeader
        title="Overtime Management"
        subtitle="Two-Stage Approval: Manager permission required before OT · Manager verification required after OT"
        badgeText={activeSession ? '🔴 OT Session In Progress' : permittedSession ? '🟢 OT Permitted Today' : 'Standard Shift'}
        rightActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchOvertime()}
              disabled={refreshing}
              className="p-2.5 rounded-2xl bg-white/80 border border-white/90 text-slate-500 hover:text-violet-600 hover:shadow-[0_6px_16px_-8px_rgba(139,92,246,0.5)] shadow-[0_4px_14px_-8px_rgba(148,163,184,0.5)] transition-all"
              title="Refresh"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              id="request-ot-btn"
              type="button"
              onClick={() => setRequestModalOpen(true)}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-xs font-bold"
            >
              <Send size={14} />
              <span>Request OT Permission</span>
            </button>
          </div>
        }
      />

      {/* ── Alerts ── */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs flex items-start gap-2.5 shadow-[inset_0_1px_2px_rgba(244,63,94,0.08)]">
          <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600 font-bold">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 text-emerald-600 text-xs flex items-start gap-2.5 shadow-[inset_0_1px_2px_rgba(16,185,129,0.08)]">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 font-bold">×</button>
        </div>
      )}

      {/* ── 4 KPI Tiles Ribbon ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={CheckCircle2}
          value={stats.totalApprovedFormatted || '0h 00m'}
          label="Approved OT Total"
          subtext="Verified by Manager"
          variant="green"
        />
        <KpiTile
          icon={Clock}
          value={stats.totalRecordedFormatted || '0h 00m'}
          label="Recorded OT (Actual)"
          subtext="Verified Sessions"
          variant="blue"
        />
        <KpiTile
          icon={Timer}
          value={activeSession ? 'In Progress' : permittedSession ? 'Permitted' : 'Idle'}
          label="Current OT Session"
          subtext={activeSession ? 'Tracking Live Time' : permittedSession ? 'Ready to Start' : 'No Active Session'}
          variant={activeSession ? 'amber' : permittedSession ? 'purple' : 'slate'}
        />
        <KpiTile
          icon={ShieldAlert}
          value={stats.pendingTotal || 0}
          label="Pending Approvals"
          subtext={`${stats.pendingStage1Count || 0} Stage 1 · ${stats.pendingStage2Count || 0} Stage 2`}
          variant={stats.pendingTotal > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* ── Active Session / Permitted Banner ── */}
      {activeSession && (
        <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 shadow-[0_18px_44px_-16px_rgba(245,158,11,0.6)]">
          <div className="relative rounded-[calc(1.5rem-3px)] bg-gradient-to-br from-amber-50/95 via-orange-50/90 to-white/90 p-6">
            <div aria-hidden="true" className="pointer-events-none absolute -top-14 -right-14 w-56 h-56 rounded-full bg-amber-200/40 blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-[0_8px_22px_-6px_rgba(245,158,11,0.7)] flex-shrink-0">
                  <Timer size={28} className="animate-pulse" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/90 text-amber-600 text-xs font-bold mb-1 shadow-[0_4px_12px_-6px_rgba(245,158,11,0.5)]">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    Live Overtime Session
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Working on: {activeSession.reason}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Started at {new Date(activeSession.actualStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · Tracked duration will be reviewed in Stage 2.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-[0.12em]">Elapsed Focus Time</p>
                  <p className="font-mono text-3xl font-black text-slate-800 tracking-tight tabular-nums">{formatElapsed(elapsedSeconds)}</p>
                </div>
                <button
                  id="finish-ot-btn"
                  type="button"
                  onClick={() => setFinishModalOpen(true)}
                  className="btn-danger flex items-center gap-2 px-5 py-3 font-bold text-xs active:scale-95 transition-transform"
                >
                  <Square size={16} />
                  <span>Finish & Submit Work</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {permittedSession && !activeSession && (
        <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 shadow-[0_18px_44px_-16px_rgba(16,185,129,0.55)]">
          <div className="relative rounded-[calc(1.5rem-3px)] bg-gradient-to-br from-emerald-50/95 via-sky-50/90 to-white/90 p-6">
            <div aria-hidden="true" className="pointer-events-none absolute -top-14 -right-14 w-56 h-56 rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center shadow-[0_8px_22px_-6px_rgba(16,185,129,0.7)] flex-shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/90 text-emerald-600 text-xs font-bold mb-1 shadow-[0_4px_12px_-6px_rgba(16,185,129,0.5)]">
                    Stage 1 Permission Approved
                  </div>
                  <h3 className="text-base font-bold text-slate-800">Overtime Permitted for {permittedSession.date}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reason: <span className="font-semibold text-slate-700">{permittedSession.reason}</span> · Expected window: {new Date(permittedSession.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(permittedSession.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ({permittedSession.expectedDurationMinutes}m)
                  </p>
                </div>
              </div>

              <button
                id="start-ot-btn"
                type="button"
                onClick={() => handleStartSession(permittedSession._id)}
                disabled={actionLoading === 'start'}
                className="btn-success flex items-center gap-2 px-5 py-2.5 font-bold text-xs active:scale-95 transition-transform"
              >
                {actionLoading === 'start' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                <span>Start Overtime Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-Stage Workflow Explanation Card ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]">
            1
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Stage 1: OT Permission Approval</h4>
            <p className="text-xs text-slate-500 mt-1">
              Submit your expected window and reason. Your manager must grant permission <strong className="text-slate-700">before</strong> you can start OT. Unapproved sessions cannot be started.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]">
            2
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Stage 2: Work Verification Approval</h4>
            <p className="text-xs text-slate-500 mt-1">
              When finished, submit details of work performed. Only after manager verification will this time be <strong className="text-slate-700">added to your Approved OT total</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* ── Overtime History & Records Table ── */}
      <Panel
        title="Overtime Requests & Session History"
        badge={`${filteredRecords.length} records`}
        action={
          <div className="flex items-center bg-white/70 p-1 rounded-2xl border border-violet-100/80 text-xs shadow-[inset_0_2px_6px_-3px_rgba(148,163,184,0.3)]">
            {[
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending' },
              { id: 'approved', label: 'Approved' },
              { id: 'active', label: 'Active/Permitted' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTabFilter(t.id)}
                className={`px-3 py-1 rounded-xl font-semibold transition-all ${
                  tabFilter === t.id
                    ? 'bg-white text-violet-600 shadow-[0_3px_10px_-4px_rgba(139,92,246,0.5)]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            <Clock size={32} className="mx-auto text-violet-200 mb-2" />
            <p className="font-semibold text-slate-600 text-sm">No overtime records found.</p>
            <p className="mt-1">Click "Request OT Permission" above to schedule an overtime session.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-400 font-bold uppercase tracking-[0.08em] text-[10px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Requested Window</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Stage 1 (Permission)</th>
                  <th className="py-3 px-4">Recorded OT</th>
                  <th className="py-3 px-4">Stage 2 (Work Verification)</th>
                  <th className="py-3 px-4">Approved OT</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50">
                {filteredRecords.map((r) => {
                  const isPermitted = r.status === 'permission_approved';
                  const isPendingPerm = r.status === 'permission_pending';
                  const isInProgress = r.status === 'in_progress';
                  const isVerificationPending = r.status === 'work_verification_pending';
                  const isCompletedApproved = r.status === 'completed_approved';
                  const isCompletedRejected = r.status === 'completed_rejected';
                  const isPermRejected = r.status === 'permission_rejected';

                  return (
                    <tr key={r._id} className="hover:bg-violet-50/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(r.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        <span className="ml-1 text-[10px] text-slate-400">({r.expectedDurationMinutes}m)</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 max-w-[200px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isPendingPerm && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold">
                            <Clock size={11} /> Permission Pending
                          </span>
                        )}
                        {(isPermitted || isInProgress || isVerificationPending || isCompletedApproved || isCompletedRejected) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                            <Check size={11} /> Permitted
                          </span>
                        )}
                        {isPermRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-semibold">
                            <XCircle size={11} /> Denied
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {isCompletedApproved && r.recordedMinutes
                          ? `${Math.floor(r.recordedMinutes / 60)}h ${r.recordedMinutes % 60}m`
                          : isInProgress
                          ? 'Tracking…'
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isVerificationPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-semibold">
                            <Clock size={11} /> Review Pending
                          </span>
                        )}
                        {isCompletedApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold">
                            <CheckCircle2 size={11} /> Work Approved
                          </span>
                        )}
                        {isCompletedRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-semibold">
                            <XCircle size={11} /> Work Rejected
                          </span>
                        )}
                        {(isPendingPerm || isPermRejected || isPermitted || isInProgress) && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {isCompletedApproved ? (
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            +{Math.floor(r.approvedMinutes / 60)}h {r.approvedMinutes % 60}m
                          </span>
                        ) : isCompletedRejected ? (
                          <span className="text-slate-400 line-through">0h 00m</span>
                        ) : (
                          <span className="text-slate-400">0h 00m</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPermitted && !activeSession && (
                            <button
                              type="button"
                              onClick={() => handleStartSession(r._id)}
                              className="px-2.5 py-1 rounded-full text-white font-bold text-[11px] bg-[linear-gradient(135deg,#34d399_0%,#10b981_100%)] hover:bg-[linear-gradient(135deg,#10b981_0%,#059669_100%)] shadow-[0_4px_12px_-4px_rgba(16,185,129,0.6)]"
                            >
                              Start
                            </button>
                          )}
                          {(isPendingPerm || isPermitted) && (
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(r._id)}
                              className="px-2.5 py-1 rounded-full border border-violet-100 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 text-[11px] transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                          {(r.workDetails || r.permissionNote || r.workVerificationNote) && (
                            <button
                              type="button"
                              onClick={() => setViewRecord(r)}
                              className="p-1 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                              title="View details"
                            >
                              <Info size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Modal: Request Overtime Permission ── */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-violet-100 max-w-md w-full p-6 shadow-[0_30px_80px_-20px_rgba(139,92,246,0.5)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-violet-50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(139,92,246,0.4)]">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Request Overtime Permission</h3>
                  <p className="text-[11px] text-slate-400">Stage 1: Pre-Approval from Manager</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRequestModalOpen(false)}
                className="text-slate-300 hover:text-violet-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Overtime Date</label>
                <input
                  type="date"
                  value={requestForm.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRequestForm({ ...requestForm, date: e.target.value })}
                  className="input w-full text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={requestForm.startTime}
                    onChange={(e) => setRequestForm({ ...requestForm, startTime: e.target.value })}
                    className="input w-full text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={requestForm.endTime}
                    onChange={(e) => setRequestForm({ ...requestForm, endTime: e.target.value })}
                    className="input w-full text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Reason & Scope</label>
                <textarea
                  rows={3}
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                  placeholder="e.g. Complete high-priority client deliverables and final sprint testing"
                  className="input w-full text-xs"
                  required
                />
              </div>

              <div className="p-3 rounded-2xl bg-violet-50/70 border border-violet-100 text-xs text-slate-600 flex items-start gap-2">
                <Info size={14} className="text-violet-500 flex-shrink-0 mt-0.5" />
                <span>
                  Once submitted, you cannot start OT until your manager approves this Stage 1 permission.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(false)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  id="submit-ot-permission-btn"
                  type="submit"
                  disabled={actionLoading === 'request'}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {actionLoading === 'request' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Submit Permission Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Finish OT & Submit Work Details ── */}
      {finishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-violet-100 max-w-lg w-full p-6 shadow-[0_30px_80px_-20px_rgba(139,92,246,0.5)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-violet-50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Submit OT Work Details</h3>
                  <p className="text-[11px] text-slate-400">Stage 2: Work Verification Review</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFinishModalOpen(false)}
                className="text-slate-300 hover:text-violet-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFinishSession} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-white/80 border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Recorded Working Duration</p>
                  <p className="text-lg font-mono font-bold text-slate-800">{formatElapsed(elapsedSeconds)}</p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
                  Awaiting Verification
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Completed & Deliverables Generated <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={workDetails}
                  onChange={(e) => setWorkDetails(e.target.value)}
                  placeholder="Detail the specific tasks completed, client reports finished, PRs created, or bugs fixed during this OT window..."
                  className="input w-full text-xs"
                  required
                />
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-100 text-xs text-amber-600 flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Manager verification required:</strong> Your manager will verify whether the work submitted was valid. Only approved time will be added to your official Approved Overtime record.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFinishModalOpen(false)}
                  className="btn-ghost text-xs"
                >
                  Back
                </button>
                <button
                  id="confirm-submit-work-btn"
                  type="submit"
                  disabled={actionLoading === 'finish'}
                  className="btn-success text-xs flex items-center gap-2"
                >
                  {actionLoading === 'finish' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Submit for Verification</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Record Inspection ── */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-violet-100 max-w-md w-full p-6 shadow-[0_30px_80px_-20px_rgba(139,92,246,0.5)] space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-violet-50">
              <h3 className="text-sm font-bold text-slate-800">Overtime Details ({viewRecord.date})</h3>
              <button
                type="button"
                onClick={() => setViewRecord(null)}
                className="text-slate-300 hover:text-violet-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase">Reason for OT</p>
                <p className="text-slate-700 mt-0.5">{viewRecord.reason}</p>
              </div>

              {viewRecord.permissionNote && (
                <div className="p-2.5 rounded-2xl bg-violet-50/70 border border-violet-100">
                  <p className="text-[11px] font-semibold text-violet-600">Manager Permission Note (Stage 1)</p>
                  <p className="text-slate-700 mt-0.5">{viewRecord.permissionNote}</p>
                </div>
              )}

              {viewRecord.workDetails && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Submitted Work (Stage 2)</p>
                  <p className="text-slate-700 mt-0.5 whitespace-pre-wrap bg-white/80 p-3 rounded-2xl border border-violet-50">
                    {viewRecord.workDetails}
                  </p>
                </div>
              )}

              {viewRecord.workVerificationNote && (
                <div className="p-2.5 rounded-2xl bg-violet-50/70 border border-violet-100">
                  <p className="text-[11px] font-semibold text-violet-600">Manager Verification Note (Stage 2)</p>
                  <p className="text-slate-700 mt-0.5">{viewRecord.workVerificationNote}</p>
                </div>
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setViewRecord(null)}
                className="btn-ghost text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Timer,
  Check, X, RefreshCw, Loader2, FileText, User,
  Calendar, ShieldAlert, ChevronRight, Info, AlertTriangle, Users
} from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';

export default function TeamOvertimePage() {
  const [data, setData] = useState({ records: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState('stage1'); // 'stage1' | 'stage2' | 'members' | 'history'

  // Stage 1 Decision Modal
  const [stage1Modal, setStage1Modal] = useState(null); // { record, action: 'approve' | 'reject' }
  const [stage1Note, setStage1Note] = useState('');

  // Stage 2 Decision Modal
  const [stage2Modal, setStage2Modal] = useState(null); // { record, action: 'approve' | 'reject' }
  const [stage2Mins, setStage2Mins] = useState(0);
  const [stage2Note, setStage2Note] = useState('');

  const fetchTeamOvertime = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      setErrorMsg(null);
      const res = await api.get('/manager/team/overtime');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load team overtime:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load team overtime records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamOvertime();
  }, [fetchTeamOvertime]);

  // Stage 1 Decision Handler
  const handleStage1Decision = async () => {
    if (!stage1Modal) return;
    const { record, action } = stage1Modal;

    setActionLoading(`stage1_${record._id}`);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await api.post(`/manager/team/overtime/${record._id}/permission-decision`, {
        action,
        note: stage1Note.trim() || undefined,
      });

      setSuccessMsg(
        action === 'approve'
          ? `Overtime permission approved for ${record.userId?.name || 'employee'}. They can now start the session.`
          : `Overtime permission denied for ${record.userId?.name || 'employee'}.`
      );
      setStage1Modal(null);
      setStage1Note('');
      fetchTeamOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to resolve permission request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Stage 2 Decision Handler
  const handleStage2Decision = async () => {
    if (!stage2Modal) return;
    const { record, action } = stage2Modal;

    // Strict frontend validation enforcing backend cap
    if (action === 'approve') {
      const mins = Number(stage2Mins);
      if (isNaN(mins) || mins < 0) {
        setErrorMsg('Please enter a valid number of approved minutes.');
        return;
      }
      if (mins > record.recordedMinutes) {
        setErrorMsg(
          `Approved OT minutes (${mins}) cannot exceed the recorded OT duration (${record.recordedMinutes} mins). The backend strictly enforces this maximum.`
        );
        return;
      }
    }

    setActionLoading(`stage2_${record._id}`);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await api.post(`/manager/team/overtime/${record._id}/work-decision`, {
        action,
        approvedMinutes: action === 'approve' ? Number(stage2Mins) : 0,
        note: stage2Note.trim() || undefined,
      });

      setSuccessMsg(
        action === 'approve'
          ? `Work verified! ${Math.floor(stage2Mins / 60)}h ${stage2Mins % 60}m added to ${record.userId?.name || 'employee'}'s official Approved OT Total.`
          : `Work rejected for ${record.userId?.name || 'employee'}. 0 minutes added to approved total.`
      );
      setStage2Modal(null);
      setStage2Note('');
      fetchTeamOvertime(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to resolve work verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const records = data.records || [];
  const stats = data.stats || {};
  const teamMembers = stats.teamMembers || [];

  // Filter queues
  const stage1Queue = records.filter((r) => r.status === 'permission_pending');
  const stage2Queue = records.filter((r) => r.status === 'work_verification_pending');
  const historyQueue = records.filter((r) =>
    ['completed_approved', 'completed_rejected', 'permission_rejected', 'cancelled'].includes(r.status)
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin text-violet-600" />
        <p className="text-sm font-semibold text-slate-600">Loading Team Overtime Approvals…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in text-slate-900">
      {/* ── Page Header ── */}
      <PageHeader
        title="Team Overtime Approvals"
        subtitle="Two-Stage Review: Stage 1 Permission Approval (Before OT) · Stage 2 Work Deliverables Verification (After OT)"
        badgeText={`${stats.pendingPermissionsCount || 0} Stage 1 · ${stats.pendingWorkVerificationsCount || 0} Stage 2`}
        rightActions={
          <button
            type="button"
            onClick={() => fetchTeamOvertime()}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* ── Alerts ── */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700 font-bold">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
        </div>
      )}

      {/* ── 4 KPI Ribbon Tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={Clock}
          value={stats.pendingPermissionsCount || 0}
          label="Stage 1: Pending Permissions"
          subtext="Pre-OT Requests Awaiting Approval"
          variant={stats.pendingPermissionsCount > 0 ? 'orange' : 'slate'}
          onClick={() => setActiveTab('stage1')}
        />
        <KpiTile
          icon={FileText}
          value={stats.pendingWorkVerificationsCount || 0}
          label="Stage 2: Work Verifications"
          subtext="Finished Sessions Awaiting Review"
          variant={stats.pendingWorkVerificationsCount > 0 ? 'purple' : 'slate'}
          onClick={() => setActiveTab('stage2')}
        />
        <KpiTile
          icon={CheckCircle2}
          value={stats.teamApprovedFormatted || '0h 00m'}
          label="Team Approved OT"
          subtext="Official Verified Time Added"
          variant="green"
        />
        <KpiTile
          icon={Timer}
          value={stats.activeSessionsCount || 0}
          label="Members on Active OT"
          subtext="Currently Clocked In"
          variant={stats.activeSessionsCount > 0 ? 'blue' : 'slate'}
        />
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('stage1')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'stage1'
              ? 'bg-amber-50 text-amber-800 border border-amber-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Stage 1: Permission Requests</span>
          {stage1Queue.length > 0 && (
            <span className="px-2 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">
              {stage1Queue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('stage2')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'stage2'
              ? 'bg-violet-50 text-violet-800 border border-violet-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Stage 2: Work Verification Queue</span>
          {stage2Queue.length > 0 && (
            <span className="px-2 py-0.2 rounded-full bg-violet-200 text-violet-900 text-[10px] font-black">
              {stage2Queue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'members'
              ? 'bg-sky-50 text-sky-800 border border-sky-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users size={14} />
          <span>Team Member Totals</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'history'
              ? 'bg-slate-100 text-slate-800 border border-slate-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar size={14} />
          <span>Resolved Audit History</span>
        </button>
      </div>

      {/* ── Sub-Tab 1: Stage 1 Permission Requests ── */}
      {activeTab === 'stage1' && (
        <Panel
          title="Stage 1: Pre-Overtime Permission Requests"
          badge={`${stage1Queue.length} awaiting permission`}
          subtitle="Employees cannot start an OT session without this permission approval."
        >
          {stage1Queue.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-slate-700 text-sm">All caught up!</p>
              <p className="mt-1">No pending Stage 1 overtime permission requests.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stage1Queue.map((r) => (
                <div key={r._id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {r.userId?.avatarUrl ? (
                        <img
                          src={r.userId.avatarUrl}
                          alt={r.userId?.name || 'Employee'}
                          className="w-9 h-9 rounded-xl object-cover shadow-xs border border-amber-200"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold flex items-center justify-center text-xs">
                          {r.userId?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{r.userId?.name || 'Unknown Employee'}</h4>
                        <p className="text-[11px] text-slate-500">{r.userId?.designation || r.userId?.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Permission Pending
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Date:</span>
                      <span className="font-bold text-slate-900">{r.date}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Requested Window:</span>
                      <span className="font-mono text-slate-800">
                        {new Date(r.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        <span className="ml-1 text-[10px] text-slate-500 font-normal">({r.expectedDurationMinutes} mins)</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block mt-1">Reason:</span>
                      <p className="text-slate-800 italic mt-0.5">{r.reason}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStage1Modal({ record: r, action: 'reject' });
                        setStage1Note('');
                      }}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 font-bold text-xs hover:bg-rose-50 transition-colors"
                    >
                      Deny Permission
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStage1Modal({ record: r, action: 'approve' });
                        setStage1Note('');
                      }}
                      className="btn-success text-xs flex items-center gap-1.5 px-4 py-1.5"
                    >
                      <Check size={14} />
                      <span>Approve Permission</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ── Sub-Tab 2: Stage 2 Work Verification Queue ── */}
      {activeTab === 'stage2' && (
        <Panel
          title="Stage 2: Overtime Work Verification Queue"
          badge={`${stage2Queue.length} awaiting verification`}
          subtitle="Manager verification determines whether actual worked OT time is added to employee's accumulated total. Backend strictly enforces Approved OT ≤ Recorded OT."
        >
          {stage2Queue.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No work verifications pending!</p>
              <p className="mt-1">All completed overtime sessions have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stage2Queue.map((r) => {
                const recordedHrs = Math.floor(r.recordedMinutes / 60);
                const recordedMins = r.recordedMinutes % 60;
                const recordedFmt = `${recordedHrs}h ${recordedMins}m`;

                return (
                  <div key={r._id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        {r.userId?.avatarUrl ? (
                          <img
                            src={r.userId.avatarUrl}
                            alt={r.userId?.name || 'Employee'}
                            className="w-10 h-10 rounded-xl object-cover shadow-xs border border-violet-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 text-violet-800 font-bold flex items-center justify-center text-sm">
                            {r.userId?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{r.userId?.name || 'Unknown Employee'}</h4>
                          <p className="text-xs text-slate-500">{r.userId?.designation || r.userId?.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                          Stage 2: Work Review
                        </span>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                          Date: {r.date}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Column 1: Requested vs Actual Window */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Session Timing</p>
                        <div>
                          <p className="text-slate-500">Requested Window:</p>
                          <p className="font-mono text-slate-800 font-medium">
                            {new Date(r.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ({r.expectedDurationMinutes}m)
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Actual Worked Window:</p>
                          <p className="font-mono text-slate-900 font-bold">
                            {new Date(r.actualStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.actualEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="pt-1 border-t border-slate-200">
                          <p className="text-slate-500">Total Recorded Duration:</p>
                          <p className="text-base font-mono font-black text-slate-900">{recordedFmt} ({r.recordedMinutes} mins)</p>
                        </div>
                      </div>

                      {/* Column 2: Initial Reason & Stage 1 Decider */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Initial Permission Context</p>
                        <div>
                          <p className="text-slate-500">Stated Purpose:</p>
                          <p className="text-slate-800 font-medium italic mt-0.5">{r.reason}</p>
                        </div>
                        <div className="pt-1 border-t border-slate-200">
                          <p className="text-slate-500">Permission Granted By:</p>
                          <p className="text-slate-800 font-medium">
                            {r.permissionDecisionBy?.name || 'Manager'} on {r.permissionDecisionAt ? new Date(r.permissionDecisionAt).toLocaleDateString('en-IN') : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Column 3: Submitted Work Description */}
                      <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-2">
                        <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <FileText size={12} />
                          <span>Submitted Work Deliverables</span>
                        </p>
                        <p className="text-slate-800 whitespace-pre-wrap font-medium text-xs max-h-32 overflow-y-auto pr-1">
                          {r.workDetails || 'No work description submitted.'}
                        </p>
                      </div>
                    </div>

                    {/* Stage 2 Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Info size={14} className="text-violet-600" />
                        <span>Manager Verification Rule: Approved OT cannot exceed Recorded OT ({r.recordedMinutes} mins).</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStage2Modal({ record: r, action: 'reject' });
                            setStage2Note('');
                            setStage2Mins(0);
                          }}
                          className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 font-bold text-xs hover:bg-rose-50 transition-colors"
                        >
                          Reject Work (0 mins)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStage2Modal({ record: r, action: 'approve' });
                            setStage2Mins(r.recordedMinutes);
                            setStage2Note('');
                          }}
                          className="btn-success text-xs flex items-center gap-1.5 px-4 py-2 font-bold shadow-sm"
                        >
                          <CheckCircle2 size={14} />
                          <span>Verify & Approve Work</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* ── Sub-Tab 3: Team Member Totals ── */}
      {activeTab === 'members' && (
        <Panel
          title="Team Member Overtime Accumulated Totals"
          subtitle="Distinction: Recorded OT Time is total tracked duration; Approved OT Time is the manager-verified total that counts."
          badge={`${teamMembers.length} team members`}
        >
          {teamMembers.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <Users size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No team member overtime history recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Completed Sessions</th>
                    <th className="py-3 px-4">Pending Requests</th>
                    <th className="py-3 px-4">Total Recorded OT</th>
                    <th className="py-3 px-4 text-right">Official Approved OT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamMembers.map((m) => (
                    <tr key={m.user?._id || m.user} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {m.user?.name || 'Unknown'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {m.user?.email || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {m.completedSessions}
                      </td>
                      <td className="py-3.5 px-4">
                        {m.pendingSessions > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                            {m.pendingSessions} pending
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {m.recordedFormatted}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          {m.approvedFormatted}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Sub-Tab 4: Resolved Audit History ── */}
      {activeTab === 'history' && (
        <Panel
          title="Overtime Audit History"
          badge={`${historyQueue.length} records`}
          subtitle="Audit trail of all resolved Stage 1 & Stage 2 decisions."
        >
          {historyQueue.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <Clock size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No resolved overtime sessions yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Initial Reason</th>
                    <th className="py-3 px-4">Stage 1 Decider</th>
                    <th className="py-3 px-4">Recorded Duration</th>
                    <th className="py-3 px-4">Stage 2 Verifier</th>
                    <th className="py-3 px-4">Approved Duration</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyQueue.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {r.userId?.name || 'Unknown'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-[150px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {r.permissionDecisionBy?.name || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {r.recordedMinutes ? `${Math.floor(r.recordedMinutes / 60)}h ${r.recordedMinutes % 60}m` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {r.workVerifiedBy?.name || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {r.status === 'completed_approved' ? (
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            +{Math.floor(r.approvedMinutes / 60)}h {r.approvedMinutes % 60}m
                          </span>
                        ) : (
                          <span className="text-slate-400">0h 00m</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {r.status === 'completed_approved' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                            Approved
                          </span>
                        )}
                        {r.status === 'completed_rejected' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                            Work Rejected
                          </span>
                        )}
                        {r.status === 'permission_rejected' && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold text-[10px]">
                            Permission Denied
                          </span>
                        )}
                        {r.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px]">
                            Cancelled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Modal: Stage 1 Permission Decision ── */}
      {stage1Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {stage1Modal.action === 'approve' ? 'Approve OT Permission' : 'Deny OT Permission'}
              </h3>
              <button onClick={() => setStage1Modal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">×</button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <p className="font-bold text-slate-900">{stage1Modal.record?.userId?.name}</p>
              <p className="text-slate-600">Date: {stage1Modal.record?.date}</p>
              <p className="text-slate-600">
                Window: {new Date(stage1Modal.record?.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(stage1Modal.record?.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ({stage1Modal.record?.expectedDurationMinutes}m)
              </p>
              <p className="text-slate-800 italic mt-1">"{stage1Modal.record?.reason}"</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {stage1Modal.action === 'approve' ? 'Optional Approval Note' : 'Reason for Denial'}
              </label>
              <textarea
                rows={2}
                value={stage1Note}
                onChange={(e) => setStage1Note(e.target.value)}
                placeholder={stage1Modal.action === 'approve' ? 'e.g. Approved. Please focus on client report deliverables.' : 'e.g. Overtime not authorized for this task.'}
                className="input w-full text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStage1Modal(null)} className="btn-ghost text-xs">Cancel</button>
              <button
                type="button"
                onClick={handleStage1Decision}
                disabled={actionLoading}
                className={`text-xs font-bold px-4 py-2 rounded-xl text-white ${
                  stage1Modal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {stage1Modal.action === 'approve' ? 'Confirm Permission Approval' : 'Confirm Denial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Stage 2 Work Verification Decision ── */}
      {stage2Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {stage2Modal.action === 'approve' ? 'Verify & Approve Overtime Work' : 'Reject Overtime Work'}
              </h3>
              <button onClick={() => setStage2Modal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">×</button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{stage2Modal.record?.userId?.name}</span>
                <span className="font-mono text-slate-700">{stage2Modal.record?.date}</span>
              </div>
              <div className="text-slate-600">
                <span>Recorded Time Spent: </span>
                <strong className="text-slate-900 font-mono">
                  {Math.floor(stage2Modal.record?.recordedMinutes / 60)}h {stage2Modal.record?.recordedMinutes % 60}m ({stage2Modal.record?.recordedMinutes} mins)
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Submitted Deliverables:</span>
                <p className="text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 mt-1 whitespace-pre-wrap max-h-28 overflow-y-auto">
                  {stage2Modal.record?.workDetails || 'No details.'}
                </p>
              </div>
            </div>

            {stage2Modal.action === 'approve' ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Approved OT Duration (Minutes)</label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Cap: {stage2Modal.record?.recordedMinutes} mins
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={stage2Modal.record?.recordedMinutes}
                      value={stage2Mins}
                      onChange={(e) => setStage2Mins(e.target.value)}
                      className="input w-36 text-xs font-mono font-bold"
                    />
                    <span className="text-xs text-slate-600 font-mono">
                      = {Math.floor(Number(stage2Mins || 0) / 60)}h {Number(stage2Mins || 0) % 60}m
                    </span>
                    <button
                      type="button"
                      onClick={() => setStage2Mins(stage2Modal.record?.recordedMinutes)}
                      className="text-[11px] text-sky-600 hover:underline ml-auto font-medium"
                    >
                      Reset to full time
                    </button>
                  </div>
                  {Number(stage2Mins) > stage2Modal.record?.recordedMinutes && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1">
                      ⚠️ Approved minutes cannot exceed recorded duration ({stage2Modal.record?.recordedMinutes} mins).
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Optional Manager Note</label>
                  <textarea
                    rows={2}
                    value={stage2Note}
                    onChange={(e) => setStage2Note(e.target.value)}
                    placeholder="e.g. Work deliverables verified. Client report accepted."
                    className="input w-full text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Work Rejection Impact:</strong> 0 minutes will be added to the employee's Approved OT Total. The session will remain on record as rejected for audit purposes.
                  </span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reason for Rejection <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={2}
                    value={stage2Note}
                    onChange={(e) => setStage2Note(e.target.value)}
                    placeholder="Specify why the submitted work is rejected (e.g. Deliverable was incomplete or unrelated to stated scope)."
                    className="input w-full text-xs"
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStage2Modal(null)} className="btn-ghost text-xs">Cancel</button>
              <button
                type="button"
                onClick={handleStage2Decision}
                disabled={actionLoading || (stage2Modal.action === 'approve' && Number(stage2Mins) > stage2Modal.record?.recordedMinutes)}
                className={`text-xs font-bold px-4 py-2 rounded-xl text-white ${
                  stage2Modal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {stage2Modal.action === 'approve'
                  ? `Approve ${Math.floor(Number(stage2Mins || 0) / 60)}h ${Number(stage2Mins || 0) % 60}m OT`
                  : 'Confirm Work Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

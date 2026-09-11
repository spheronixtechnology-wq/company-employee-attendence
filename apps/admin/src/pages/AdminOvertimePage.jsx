import { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Timer,
  RefreshCw, Loader2, FileText, User, Calendar, Users,
  Building2, ArrowUpDown
} from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';

export default function AdminOvertimePage() {
  const [data, setData] = useState({ records: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCompanyOvertime = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      setErrorMsg(null);
      const res = await api.get('/admin/overtime');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load company overtime:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load company overtime records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanyOvertime();
  }, [fetchCompanyOvertime]);

  const records = data.records || [];
  const stats = data.stats || {};

  const filteredRecords = records.filter((r) => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'approved'
        ? r.status === 'completed_approved'
        : statusFilter === 'pending'
        ? ['permission_pending', 'work_verification_pending'].includes(r.status)
        : statusFilter === 'rejected'
        ? ['completed_rejected', 'permission_rejected'].includes(r.status)
        : r.status === statusFilter;

    const matchesSearch =
      !searchTerm ||
      r.userId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.userId?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date?.includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin text-sky-600" />
        <p className="text-sm font-semibold text-slate-600">Loading Company Overtime Records…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-900">
      {/* ── Page Header ── */}
      <PageHeader
        title="Company Overtime Oversight"
        subtitle="Centralized audit trail: Stage 1 Permission Approvals, Stage 2 Verified Work Deliverables, and Cumulative Hours"
        badgeText={`${stats.totalRecords || 0} Total Sessions`}
        rightActions={
          <button
            type="button"
            onClick={() => fetchCompanyOvertime()}
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

      {/* ── 4 KPI Ribbon Tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={CheckCircle2}
          value={stats.totalApprovedFormatted || '0h 00m'}
          label="Total Approved OT"
          subtext="Verified & Counted for Payroll"
          variant="green"
        />
        <KpiTile
          icon={Clock}
          value={stats.totalRecordedFormatted || '0h 00m'}
          label="Total Recorded OT"
          subtext="Raw Tracked Work Duration"
          variant="blue"
        />
        <KpiTile
          icon={Calendar}
          value={stats.pendingStage1Count || 0}
          label="Pending Stage 1 Permissions"
          subtext="Pre-OT Requests Awaiting Approval"
          variant={stats.pendingStage1Count > 0 ? 'orange' : 'slate'}
        />
        <KpiTile
          icon={FileText}
          value={stats.pendingStage2Count || 0}
          label="Pending Stage 2 Verifications"
          subtext="Finished Work Awaiting Verification"
          variant={stats.pendingStage2Count > 0 ? 'purple' : 'slate'}
        />
      </div>

      {/* ── Company Overtime Sessions Audit Table ── */}
      <Panel
        title="All Company Overtime Records"
        badge={`${filteredRecords.length} sessions`}
        subtitle="Authoritative Rule: Daily Attendance Time, Recorded OT Time, and Approved OT Time are tracked distinctly. Only manager-verified Stage 2 hours count toward employee approved OT totals."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search employee, reason, date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-sm"
            />
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'approved', label: 'Approved' },
                { id: 'pending', label: 'Pending' },
                { id: 'rejected', label: 'Rejected' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStatusFilter(t.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === t.id
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            <Clock size={32} className="mx-auto text-slate-400 mb-2" />
            <p className="font-semibold text-slate-700 text-sm">No overtime sessions found matching your filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Requested Window</th>
                  <th className="py-3 px-4">Stated Purpose</th>
                  <th className="py-3 px-4">Stage 1 Decider</th>
                  <th className="py-3 px-4">Recorded OT</th>
                  <th className="py-3 px-4">Submitted Work</th>
                  <th className="py-3 px-4">Stage 2 Verifier</th>
                  <th className="py-3 px-4">Official Approved OT</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-bold text-slate-900">{r.userId?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">{r.userId?.email}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {r.teamId?.name || 'General'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {new Date(r.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      <span className="ml-1 text-[10px] text-slate-400">({r.expectedDurationMinutes}m)</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 max-w-[150px] truncate" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {r.permissionDecisionBy?.name || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {r.recordedMinutes ? `${Math.floor(r.recordedMinutes / 60)}h ${r.recordedMinutes % 60}m` : r.status === 'in_progress' ? 'Live' : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 max-w-[180px] truncate" title={r.workDetails || 'No work details'}>
                      {r.workDetails || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
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
                      {r.status === 'permission_pending' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                          Stage 1 Pending
                        </span>
                      )}
                      {r.status === 'permission_approved' && (
                        <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-bold text-[10px]">
                          Permitted
                        </span>
                      )}
                      {r.status === 'in_progress' && (
                        <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-bold text-[10px] animate-pulse">
                          Live OT
                        </span>
                      )}
                      {r.status === 'work_verification_pending' && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-bold text-[10px]">
                          Stage 2 Review
                        </span>
                      )}
                      {r.status === 'permission_rejected' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
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
    </div>
  );
}

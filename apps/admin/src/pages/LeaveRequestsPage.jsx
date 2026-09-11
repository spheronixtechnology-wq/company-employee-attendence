import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Calendar, CheckCircle2, XCircle, Search, RefreshCw,
  Filter, Users, Clock, AlertTriangle, ChevronRight, MessageSquare,
  ShieldCheck, FileText
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [teams, setTeams] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [filter, setFilter] = useState('pending');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState({ open: false, requestId: null, reason: '' });

  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = `status=${filter}`;
      const teamParam = selectedTeam !== 'all' ? `&teamId=${selectedTeam}` : '';
      const res = await api.get(`/admin/leave-requests?${statusParam}${teamParam}`);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.teams) {
        setTeams(data.teams);
      }
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to load leave requests:', err);
      setActionMessage({ type: 'error', text: 'Failed to load leave requests.' });
    } finally {
      setLoading(false);
    }
  }, [filter, selectedTeam]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;
    const onLeaveEvent = () => {
      fetchRequests();
    };
    socket.on('leave:request_created', onLeaveEvent);
    socket.on('leave:request_resolved', onLeaveEvent);
    return () => {
      socket.off('leave:request_created', onLeaveEvent);
      socket.off('leave:request_resolved', onLeaveEvent);
    };
  }, [socket, fetchRequests]);

  const handleDecision = async (id, decision, decisionNote = '') => {
    setProcessingId(id + decision);
    try {
      await api.post(`/admin/leave/${id}/decision`, {
        decision,
        decisionNote: decisionNote || undefined,
      });
      setActionMessage({
        type: 'success',
        text: `Leave request ${decision === 'approved' ? 'approved ✅' : 'rejected ❌'}.`,
      });
      fetchRequests();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || `Failed to ${decision} leave request.`,
      });
    } finally {
      setProcessingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const openRejectModal = (requestId) => {
    setRejectModal({ open: true, requestId, reason: '' });
  };

  const confirmReject = async () => {
    if (!rejectModal.requestId) return;
    const { requestId, reason } = rejectModal;
    setRejectModal({ open: false, requestId: null, reason: '' });
    await handleDecision(requestId, 'rejected', reason);
  };

  // Filter requests by search query
  const filteredRequests = requests.filter((req) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = req.userId?.name?.toLowerCase() || '';
    const email = req.userId?.email?.toLowerCase() || '';
    const leaveType = req.leaveTypeId?.name?.toLowerCase() || '';
    const reason = req.reason?.toLowerCase() || '';
    return name.includes(q) || email.includes(q) || leaveType.includes(q) || reason.includes(q);
  });

  // Stats counts across selected team (independent of active status filter/search)
  const totalInView = counts?.total ?? requests.length;
  const pendingCount = counts?.pending ?? requests.filter((r) => r.status === 'pending').length;
  const approvedCount = counts?.approved ?? requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = counts?.rejected ?? requests.filter((r) => r.status === 'rejected').length;

  return (
    <div className="page-container space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Calendar className="text-primary-600" size={26} />
            Leave Requests
          </h1>
          <p className="text-slate-600 text-xs mt-1">
            Review, approve, or reject employee leave applications across all departments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRequests}
            className="btn bg-white flex items-center gap-2 text-xs py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-sm"
            title="Refresh requests"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary-600' : ''} />
            <span className="font-semibold">Refresh</span>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="card p-4 border border-slate-200 bg-white flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-slate-900">{totalInView}</p>
            <p className="text-[11px] text-slate-600 font-medium">Total In View</p>
          </div>
        </div>

        <div
          onClick={() => setFilter('pending')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm ${
            filter === 'pending'
              ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          } flex items-center gap-3`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-amber-700">{pendingCount}</p>
            <p className="text-[11px] text-slate-600 font-medium">Pending Review</p>
          </div>
        </div>

        <div
          onClick={() => setFilter('approved')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm ${
            filter === 'approved'
              ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          } flex items-center gap-3`}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-emerald-700">{approvedCount}</p>
            <p className="text-[11px] text-slate-600 font-medium">Approved</p>
          </div>
        </div>

        <div
          onClick={() => setFilter('rejected')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm ${
            filter === 'rejected'
              ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          } flex items-center gap-3`}
        >
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
            <XCircle size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-rose-700">{rejectedCount}</p>
            <p className="text-[11px] text-slate-600 font-medium">Rejected</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { key: 'pending', label: 'Pending', count: pendingCount },
            { key: 'approved', label: 'Approved', count: approvedCount },
            { key: 'rejected', label: 'Rejected', count: rejectedCount },
            { key: 'all', label: 'All Requests', count: totalInView },
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                id={`tab-leave-${tab.key}`}
                onClick={() => setFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Team Filter & Search */}
        <div className="flex items-center gap-2">
          {/* Team dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
            <Filter size={13} className="text-slate-500 flex-shrink-0" />
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-transparent text-slate-800 text-xs font-medium outline-none border-none cursor-pointer"
            >
              <option value="all" className="bg-white text-slate-800">All Teams</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id} className="bg-white text-slate-800">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick search */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee / reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-primary-500 shadow-sm transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Leave Request List */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-600 border-slate-200 shadow-sm">
          <Loader2 className="animate-spin text-primary-600 mb-3" size={32} />
          <p className="text-xs">Loading leave requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card text-center py-16 border-dashed border-slate-200 bg-white shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Calendar size={24} />
          </div>
          <p className="text-slate-800 font-bold text-sm">No leave requests found</p>
          <p className="text-slate-500 text-xs mt-1">
            {search
              ? `No requests matching "${search}"`
              : `There are no ${filter !== 'all' ? filter : ''} leave requests to display.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';

            const userInitials = req.userId?.name
              ? req.userId.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              : 'U';

            return (
              <div
                key={req._id}
                className={`card transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 shadow-sm border ${
                  isPending
                    ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Left Employee & Details */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                    {userInitials}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-slate-900 font-bold text-sm truncate">{req.userId?.name || 'Unknown Employee'}</p>
                      {req.userId?.designation && (
                        <span className="text-[11px] text-slate-600 font-medium">
                          • {req.userId.designation}
                        </span>
                      )}
                      {req.userId?.teamId?.name && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold">
                          {req.userId.teamId.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                      <span className="px-2.5 py-0.5 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 font-bold text-[11px]">
                        {req.leaveTypeId?.name || 'Leave'}
                      </span>
                      <span className="font-bold text-slate-900">
                        {req.startDate} <span className="text-slate-400">→</span> {req.endDate}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                        {req.totalDays} {req.totalDays === 1 ? 'day' : 'days'}
                      </span>
                      {req.createdAt && (
                        <span className="text-slate-500 text-[11px]">
                          Applied {new Date(req.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Submitted Reason Box */}
                    {req.reason && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 max-w-2xl mt-1">
                        <span className="text-slate-600 font-semibold block text-[11px] mb-0.5">Reason:</span>
                        <p className="italic text-slate-700 leading-relaxed">"{req.reason}"</p>
                      </div>
                    )}

                    {/* Rejection Note or Decision info if resolved */}
                    {req.decisionNote && (
                      <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5">
                        <MessageSquare size={12} className="text-slate-500" />
                        <span>Note: <strong className="text-slate-800">{req.decisionNote}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions or Status */}
                <div className="flex items-center gap-2.5 flex-shrink-0 self-end lg:self-center">
                  {isPending ? (
                    <div className="flex items-center gap-2">
                      <button
                        id={`approve-leave-${req._id}`}
                        onClick={() => handleDecision(req._id, 'approved')}
                        disabled={!!processingId}
                        className="py-2 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {processingId === req._id + 'approved' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        <span>Approve</span>
                      </button>

                      <button
                        id={`reject-leave-${req._id}`}
                        onClick={() => openRejectModal(req._id)}
                        disabled={!!processingId}
                        className="py-2 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {processingId === req._id + 'rejected' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <XCircle size={14} />
                        )}
                        <span>Reject</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-xl border flex items-center gap-1.5 ${
                          isApproved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isRejected
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isApproved && <CheckCircle2 size={13} />}
                        {isRejected && <XCircle size={13} />}
                        <span className="capitalize">{req.status}</span>
                      </span>
                      {req.decidedAt && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(req.decidedAt).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card w-full max-w-md bg-white border border-slate-200 p-6 space-y-4 shadow-2xl rounded-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-rose-600 font-bold text-base">
              <XCircle size={20} />
              <h2>Reject Leave Request</h2>
            </div>
            <p className="text-slate-600 text-xs">
              Please enter an optional reason for rejecting this leave request so the employee understands why:
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Critical project deadline on those dates, insufficient coverage..."
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-rose-500 transition-colors"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}
                className="btn bg-white text-xs px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-reject-btn"
                onClick={confirmReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/20 transition-all"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

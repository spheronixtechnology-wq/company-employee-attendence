import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import {
  Smartphone, MapPin, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
  RefreshCw, User, Globe, Shield, Search, Calendar,
  Check, ArrowRight, Sparkles
} from 'lucide-react';

// ── Manager Device Requests Page ──────────────────────────────────────────────
export function ManagerDeviceRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);
  const [expandedTech, setExpandedTech] = useState({});
  const [decisionNotes, setDecisionNotes] = useState({});
  const [approvedUntils, setApprovedUntils] = useState({});
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/device-requests?status=${statusFilter}`);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage({ type: 'error', text: 'You do not have permission to manage device requests.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load device requests.' });
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time WebSocket updates for device requests
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchRequests();
    socket.on('device:request_created', onUpdate);
    socket.on('device:request_resolved', onUpdate);
    return () => {
      socket.off('device:request_created', onUpdate);
      socket.off('device:request_resolved', onUpdate);
    };
  }, [socket, fetchRequests]);

  // Poll for new requests every 30s + refetch when tab becomes visible
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchRequests, processing]);

  const handleDecision = async (requestId, action, empName) => {
    setProcessing(requestId + action);
    try {
      const payload = {
        action,
        decisionNote: decisionNotes[requestId] || null,
      };
      if (approvedUntils[requestId] && action === 'approve') {
        payload.approvedUntil = new Date(approvedUntils[requestId]).toISOString();
      }
      await api.patch(`/manager/device-requests/${requestId}/decision`, payload);
      
      setMessage({
        type: 'success',
        text: `Device request for ${empName || 'employee'} ${action}d successfully.`,
        actionTab: action === 'approve' ? 'approved' : 'rejected',
      });

      setDecisionNotes((prev) => ({ ...prev, [requestId]: '' }));
      setApprovedUntils((prev) => ({ ...prev, [requestId]: '' }));
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || `Failed to ${action} request.` });
    } finally {
      setProcessing(null);
    }
  };

  const typeStyles = {
    register: 'bg-sky-50 text-sky-700 border-sky-200',
    replacement: 'bg-violet-50 text-violet-700 border-violet-200',
    temporary: 'bg-amber-50 text-amber-700 border-amber-200',
    lost: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  // Search filtering
  const filteredRequests = requests.filter((req) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const userName = req.userId?.name?.toLowerCase() || '';
    const userEmail = req.userId?.email?.toLowerCase() || '';
    const device = req.requestedDeviceLabel?.toLowerCase() || '';
    const ip = req.ipAddress?.toLowerCase() || '';
    const reason = req.reason?.toLowerCase() || '';
    return (
      userName.includes(term) ||
      userEmail.includes(term) ||
      device.includes(term) ||
      ip.includes(term) ||
      reason.includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Smartphone className="text-violet-600" size={26} />
            Team Device Requests
          </h1>
          <p className="text-slate-600 text-sm mt-0.5">
            Review and approve your team members' mobile device registrations and access requests.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 self-start sm:self-auto text-xs px-3.5 py-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filter Tabs with Live Badges */}
        <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 overflow-x-auto">
          {[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'pending', label: 'Pending', count: counts.pending, alert: counts.pending > 0 },
            { key: 'approved', label: 'Approved', count: counts.approved },
            { key: 'rejected', label: 'Rejected', count: counts.rejected },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === tab.key
                    ? 'bg-white/20 text-white'
                    : tab.alert
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Instant Search Box */}
        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee, device, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-1.5 text-xs w-full bg-white border-slate-200 rounded-xl text-slate-900"
          />
        </div>
      </div>

      {/* Action Notification Banner */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <div className="flex items-center gap-3">
            {message.actionTab && statusFilter !== message.actionTab && (
              <button
                onClick={() => {
                  setStatusFilter(message.actionTab);
                  setMessage(null);
                }}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
              >
                View in {message.actionTab} <ArrowRight size={12} />
              </button>
            )}
            <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading && requests.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-violet-600" size={32} />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card text-center py-16 border border-slate-200 bg-white shadow-sm">
          {statusFilter === 'pending' ? (
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                <Check size={24} />
              </div>
              <h3 className="text-slate-900 font-bold text-base">All Caught Up!</h3>
              <p className="text-slate-600 text-xs">
                There are currently no pending device requests awaiting your approval.
              </p>
              {counts.all > 0 && (
                <div className="pt-2 flex justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('approved')}
                    className="btn btn-ghost border border-slate-200 text-xs py-1.5 px-3"
                  >
                    View Approved ({counts.approved})
                  </button>
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="btn btn-ghost border border-slate-200 text-xs py-1.5 px-3"
                  >
                    View All ({counts.all})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-2">
              <Smartphone size={36} className="mx-auto mb-2 text-slate-400" />
              <h3 className="text-slate-900 font-semibold text-sm">No Device Requests Found</h3>
              <p className="text-slate-600 text-xs">
                {search.trim()
                  ? `No requests match "${search}". Try clearing your search query.`
                  : `There are no ${statusFilter} device requests from your team.`}
              </p>
              {statusFilter !== 'all' && counts.all > 0 && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="btn btn-ghost border border-slate-200 text-xs py-1 px-3 mt-2"
                >
                  View All Requests ({counts.all})
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'pending';
            const empName = req.userId?.name || 'Unknown Employee';
            const empEmail = req.userId?.email || '—';
            const teamName = req.userId?.teamId?.name || null;
            const isTechExp = !!expandedTech[req._id];

            return (
              <div
                key={req._id}
                className="card border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all flex flex-col justify-between"
              >
                {/* Top Section */}
                <div className="space-y-3.5">
                  {/* Employee & Status Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700 font-bold text-sm shadow-sm flex-shrink-0">
                        {empName[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm truncate">{empName}</h3>
                          {teamName && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {teamName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{empEmail}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
                        statusStyles[req.status] || statusStyles.pending
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {/* Device Info & Reason Box (ALWAYS VISIBLE - NO CLICK REQUIRED) */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                        <Smartphone size={13} className="text-violet-600" /> Device Model
                      </span>
                      <span className="text-slate-900 font-bold truncate max-w-[180px]">
                        {req.requestedDeviceLabel || 'Unknown Device'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Request Type</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${
                          typeStyles[req.requestType] || typeStyles.replacement
                        }`}
                      >
                        {req.requestType}
                      </span>
                    </div>

                    <div className="text-xs pt-1.5 border-t border-slate-200">
                      <span className="text-slate-500 block mb-0.5 text-[11px] font-medium">Reason:</span>
                      <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 text-xs font-medium italic">
                        "{req.reason || 'No reason specified'}"
                      </p>
                    </div>

                    {req.ipAddress && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Globe size={11} className="text-sky-600" /> Request IP:
                        </span>
                        <span className="font-mono text-[10.5px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                          {req.ipAddress}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Resolution Info (For Approved or Rejected Requests) */}
                  {!isPending && (
                    <div className="text-xs space-y-1 pt-1">
                      {req.decisionNote && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Decision Note:</span>
                          <p className="text-slate-700 font-medium">{req.decisionNote}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Submitted:</span>
                        <span>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-IN') : '—'}</span>
                      </div>
                    </div>
                  )}

                  {/* Expandable Technical Diagnostics */}
                  {isTechExp && (
                    <div className="pt-2 border-t border-slate-200 space-y-2 text-xs animate-in fade-in duration-150">
                      {req.deviceFingerprint && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Shield size={12} className="text-emerald-600" /> Hardware Hash
                          </span>
                          <span className="font-mono text-[10.5px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-700">
                            {req.deviceFingerprint.slice(0, 14)}...
                          </span>
                        </div>
                      )}

                      {req.requestedUntil && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Clock size={12} className="text-amber-600" /> Access Until
                          </span>
                          <span className="text-slate-800 font-bold">
                            {new Date(req.requestedUntil).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      )}

                      {req.userAgent && (
                        <div>
                          <span className="text-slate-500 text-[10.5px] block mb-0.5">User Agent:</span>
                          <p className="font-mono text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200 truncate">
                            {req.userAgent}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Toggle Technical Details */}
                  <button
                    onClick={() =>
                      setExpandedTech((prev) => ({ ...prev, [req._id]: !prev[req._id] }))
                    }
                    className="w-full flex items-center justify-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 pt-0.5 transition-colors"
                  >
                    {isTechExp ? (
                      <>Less Details <ChevronUp size={12} /></>
                    ) : (
                      <>Hardware Diagnostics <ChevronDown size={12} /></>
                    )}
                  </button>
                </div>

                {/* Direct Action Section for Pending Requests (ALWAYS VISIBLE - NO CLICK REQUIRED) */}
                {isPending && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Add note (optional)..."
                      value={decisionNotes[req._id] || ''}
                      onChange={(e) =>
                        setDecisionNotes((prev) => ({ ...prev, [req._id]: e.target.value }))
                      }
                      className="input w-full text-xs py-1.5 px-2.5 bg-white border-slate-200 rounded-lg text-slate-900"
                    />

                    {req.requestType === 'temporary' && (
                      <div>
                        <label className="text-[10px] text-slate-600 mb-0.5 block font-medium">Approve Access Until</label>
                        <input
                          type="date"
                          value={approvedUntils[req._id] || ''}
                          onChange={(e) =>
                            setApprovedUntils((prev) => ({ ...prev, [req._id]: e.target.value }))
                          }
                          className="input w-full text-xs py-1 px-2 bg-white border-slate-200 rounded-lg text-slate-900"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecision(req._id, 'reject', empName)}
                        disabled={!!processing}
                        className="btn-danger flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        {processing === req._id + 'reject' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
                      </button>
                      <button
                        onClick={() => handleDecision(req._id, 'approve', empName)}
                        disabled={!!processing}
                        className="btn-success flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        {processing === req._id + 'approve' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle size={13} />
                        )}
                        Approve
                      </button>
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

// ── Manager Location Requests Page ────────────────────────────────────────────
export function ManagerLocationRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState({});
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/location-requests?status=${statusFilter}`);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage({ type: 'error', text: 'You do not have permission to manage location requests.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load location requests.' });
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time WebSocket updates for location requests
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => fetchRequests();
    socket.on('location:request_created', onUpdate);
    socket.on('location:request_resolved', onUpdate);
    return () => {
      socket.off('location:request_created', onUpdate);
      socket.off('location:request_resolved', onUpdate);
    };
  }, [socket, fetchRequests]);

  // Poll for new requests every 30s + refetch when tab becomes visible
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchRequests, processing]);

  const handleDecision = async (requestId, action, empName) => {
    setProcessing(requestId + action);
    try {
      await api.patch(`/manager/location-requests/${requestId}/decision`, {
        action,
        decisionNote: decisionNotes[requestId] || null,
      });
      setMessage({
        type: 'success',
        text: `Location request for ${empName || 'employee'} ${action}d successfully.`,
        actionTab: action === 'approve' ? 'approved' : 'rejected',
      });
      setDecisionNotes((prev) => ({ ...prev, [requestId]: '' }));
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || `Failed to ${action} request.` });
    } finally {
      setProcessing(null);
    }
  };

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  // Search filtering
  const filteredRequests = requests.filter((req) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const userName = req.userId?.name?.toLowerCase() || '';
    const userEmail = req.userId?.email?.toLowerCase() || '';
    const location = req.requestedLocationId?.officeName?.toLowerCase() || '';
    const reason = req.reason?.toLowerCase() || '';
    return (
      userName.includes(term) ||
      userEmail.includes(term) ||
      location.includes(term) ||
      reason.includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <MapPin className="text-violet-600" size={26} />
            Team Location Requests
          </h1>
          <p className="text-slate-600 text-sm mt-0.5">
            Review and approve requests from team members to work from another office branch.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 self-start sm:self-auto text-xs px-3.5 py-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filter Tabs with Live Badges */}
        <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 overflow-x-auto">
          {[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'pending', label: 'Pending', count: counts.pending, alert: counts.pending > 0 },
            { key: 'approved', label: 'Approved', count: counts.approved },
            { key: 'rejected', label: 'Rejected', count: counts.rejected },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === tab.key
                    ? 'bg-white/20 text-white'
                    : tab.alert
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Instant Search Box */}
        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee, office location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-1.5 text-xs w-full bg-white border-slate-200 rounded-xl text-slate-900"
          />
        </div>
      </div>

      {/* Action Notification Banner */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <div className="flex items-center gap-3">
            {message.actionTab && statusFilter !== message.actionTab && (
              <button
                onClick={() => {
                  setStatusFilter(message.actionTab);
                  setMessage(null);
                }}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
              >
                View in {message.actionTab} <ArrowRight size={12} />
              </button>
            )}
            <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading && requests.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-violet-600" size={32} />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card text-center py-16 border border-slate-200 bg-white shadow-sm">
          {statusFilter === 'pending' ? (
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                <Check size={24} />
              </div>
              <h3 className="text-slate-900 font-bold text-base">All Caught Up!</h3>
              <p className="text-slate-600 text-xs">
                There are currently no pending location requests awaiting your approval.
              </p>
              {counts.all > 0 && (
                <div className="pt-2 flex justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('approved')}
                    className="btn btn-ghost border border-slate-200 text-xs py-1.5 px-3"
                  >
                    View Approved ({counts.approved})
                  </button>
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="btn btn-ghost border border-slate-200 text-xs py-1.5 px-3"
                  >
                    View All ({counts.all})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-2">
              <MapPin size={36} className="mx-auto mb-2 text-slate-400" />
              <h3 className="text-slate-900 font-semibold text-sm">No Location Requests Found</h3>
              <p className="text-slate-600 text-xs">
                {search.trim()
                  ? `No requests match "${search}". Try clearing your search query.`
                  : `There are no ${statusFilter} location requests from your team.`}
              </p>
              {statusFilter !== 'all' && counts.all > 0 && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="btn btn-ghost border border-slate-200 text-xs py-1 px-3 mt-2"
                >
                  View All Requests ({counts.all})
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'pending';
            const empName = req.userId?.name || 'Unknown Employee';
            const empEmail = req.userId?.email || '—';
            const teamName = req.userId?.teamId?.name || null;
            const officeName = req.requestedLocationId?.officeName || 'Office Location';

            return (
              <div
                key={req._id}
                className="card border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all flex flex-col justify-between"
              >
                {/* Top Section */}
                <div className="space-y-3.5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700 font-bold text-sm shadow-sm flex-shrink-0">
                        {empName[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm truncate">{empName}</h3>
                          {teamName && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {teamName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{empEmail}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
                        statusStyles[req.status] || statusStyles.pending
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {/* Location & Details (ALWAYS VISIBLE - NO CLICK REQUIRED) */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                        <MapPin size={13} className="text-violet-600" /> Target Office
                      </span>
                      <span className="text-slate-900 font-bold truncate max-w-[180px]">
                        {officeName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Access Mode</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${
                          req.requestType === 'temporary_access'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-sky-50 border-sky-200 text-sky-700'
                        }`}
                      >
                        {req.requestType === 'temporary_access' ? 'Temporary Access' : 'Permanent'}
                      </span>
                    </div>

                    {req.requestedFrom && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">From Date:</span>
                        <span className="text-slate-900 font-semibold">
                          {new Date(req.requestedFrom).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    )}

                    {req.requestedUntil && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Until Date:</span>
                        <span className="text-slate-900 font-semibold">
                          {new Date(req.requestedUntil).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    )}

                    {req.reason && (
                      <div className="pt-1.5 border-t border-slate-200">
                        <span className="text-slate-500 block mb-0.5 text-[11px] font-medium">Reason:</span>
                        <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 text-xs font-medium italic">
                          "{req.reason}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Resolution Info (For Approved or Rejected Requests) */}
                  {!isPending && (
                    <div className="text-xs space-y-1 pt-1">
                      {req.decisionNote && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Decision Note:</span>
                          <p className="text-slate-700 font-medium">{req.decisionNote}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Submitted:</span>
                        <span>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-IN') : '—'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Direct Action Section for Pending Requests (ALWAYS VISIBLE - NO CLICK REQUIRED) */}
                {isPending && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Add note (optional)..."
                      value={decisionNotes[req._id] || ''}
                      onChange={(e) =>
                        setDecisionNotes((prev) => ({ ...prev, [req._id]: e.target.value }))
                      }
                      className="input w-full text-xs py-1.5 px-2.5 bg-white border-slate-200 rounded-lg text-slate-900"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecision(req._id, 'reject', empName)}
                        disabled={!!processing}
                        className="btn-danger flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        {processing === req._id + 'reject' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
                      </button>
                      <button
                        onClick={() => handleDecision(req._id, 'approve', empName)}
                        disabled={!!processing}
                        className="btn-success flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        {processing === req._id + 'approve' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle size={13} />
                        )}
                        Approve
                      </button>
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

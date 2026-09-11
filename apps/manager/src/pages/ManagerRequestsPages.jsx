import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import {
  Smartphone, MapPin, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
  RefreshCw, User, Globe, Shield
} from 'lucide-react';

// ── Manager Device Requests Page ──────────────────────────────────────────────
export function ManagerDeviceRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [decisionForm, setDecisionForm] = useState({ decisionNote: '', approvedUntil: '' });
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/device-requests?status=${statusFilter}`);
      setRequests(res.data.data.requests || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage({ type: 'error', text: 'You do not have permission to manage device requests.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load device requests.' });
      }
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Real-time WebSocket updates for device requests
  useEffect(() => {
    if (!socket) return;
    const onNewRequest = () => fetchRequests();
    socket.on('device:request_created', onNewRequest);
    socket.on('device:request_resolved', onNewRequest);
    return () => {
      socket.off('device:request_created', onNewRequest);
      socket.off('device:request_resolved', onNewRequest);
    };
  }, [socket, fetchRequests]);

  // Poll for new requests every 30s + refetch when the tab becomes visible
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

  const handleDecision = async (requestId, action) => {
    setProcessing(requestId + action);
    try {
      const payload = { action, decisionNote: decisionForm.decisionNote || null };
      if (decisionForm.approvedUntil && action === 'approve') {
        payload.approvedUntil = new Date(decisionForm.approvedUntil).toISOString();
      }
      await api.patch(`/manager/device-requests/${requestId}/decision`, payload);
      setMessage({ type: 'success', text: `Device request ${action}d successfully.` });
      setExpanded(null);
      setDecisionForm({ decisionNote: '', approvedUntil: '' });
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed.' });
    } finally { setProcessing(null); }
  };

  const typeColors = {
    register: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    temporary: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    replacement: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    lost: 'bg-red-500/10 border-red-500/30 text-red-400',
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Device Requests</h1>
          <p className="text-slate-600 text-sm mt-0.5">Review and approve your team members' device registration and access requests.</p>
        </div>
        <button onClick={fetchRequests} className="btn-ghost text-sm"><RefreshCw size={14} /> Refresh</button>
      </div>

      {message && (
        <div className={`p-3 rounded-xl border text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {message.text}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`btn text-xs capitalize ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-sky-600" size={28} /></div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-12 text-slate-500 shadow-sm">
          <Smartphone size={32} className="mx-auto mb-3 opacity-40" />
          No {statusFilter} device requests from your team.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req._id} className="card border border-slate-200 shadow-sm">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === req._id ? null : req._id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-slate-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{req.userId?.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize font-medium ${typeColors[req.requestType] || 'text-slate-600'}`}>
                        {req.requestType}
                      </span>
                      {req.status !== 'pending' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          {req.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
                {expanded === req._id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>

              {expanded === req._id && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="col-span-2">
                      <p className="text-slate-600 text-xs font-semibold mb-1">Reason</p>
                      <p className="text-slate-900 bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-medium">{req.reason || 'No reason provided'}</p>
                    </div>
                    {req.requestedDeviceLabel && (
                      <div>
                        <p className="text-slate-600 text-xs font-semibold flex items-center gap-1 mb-0.5"><Smartphone size={12} className="text-sky-600" /> Device</p>
                        <p className="text-slate-900 font-bold">{req.requestedDeviceLabel}</p>
                      </div>
                    )}
                    {req.ipAddress && (
                      <div>
                        <p className="text-slate-600 text-xs font-semibold flex items-center gap-1 mb-0.5"><Globe size={12} className="text-sky-600" /> Request IP</p>
                        <p className="text-slate-900 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block font-semibold">{req.ipAddress}</p>
                      </div>
                    )}
                    {req.deviceFingerprint && (
                      <div>
                        <p className="text-slate-600 text-xs font-semibold flex items-center gap-1 mb-0.5"><Shield size={12} className="text-emerald-600" /> Hardware Fingerprint</p>
                        <p className="text-emerald-800 font-mono text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block font-semibold">
                          {req.deviceFingerprint.slice(0, 12)}...
                        </p>
                      </div>
                    )}
                    {req.requestedUntil && (
                      <div>
                        <p className="text-slate-600 text-xs font-semibold flex items-center gap-1 mb-0.5"><Clock size={12} className="text-amber-600" /> Access Until</p>
                        <p className="text-slate-900 font-bold">{new Date(req.requestedUntil).toLocaleDateString('en-IN')}</p>
                      </div>
                    )}
                  </div>

                  {req.status === 'pending' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Decision Note (optional)</label>
                        <input type="text" className="input w-full text-sm" placeholder="Add a note..."
                          value={decisionForm.decisionNote} onChange={e => setDecisionForm(p => ({ ...p, decisionNote: e.target.value }))} />
                      </div>
                      {req.requestType === 'temporary' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Approve Until</label>
                          <input type="date" className="input w-full text-sm"
                            value={decisionForm.approvedUntil} onChange={e => setDecisionForm(p => ({ ...p, approvedUntil: e.target.value }))} />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => handleDecision(req._id, 'reject')} disabled={!!processing} className="btn-danger flex-1 text-sm">
                          {processing === req._id + 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                        </button>
                        <button onClick={() => handleDecision(req._id, 'approve')} disabled={!!processing} className="btn-success flex-1 text-sm">
                          {processing === req._id + 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manager Location Requests Page ────────────────────────────────────────────
export function ManagerLocationRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/location-requests?status=${statusFilter}`);
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage({ type: 'error', text: 'You do not have permission to manage location requests.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load location requests.' });
      }
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Real-time WebSocket updates for location requests
  useEffect(() => {
    if (!socket) return;
    const onNewRequest = () => fetchRequests();
    socket.on('location:request_created', onNewRequest);
    socket.on('location:request_resolved', onNewRequest);
    return () => {
      socket.off('location:request_created', onNewRequest);
      socket.off('location:request_resolved', onNewRequest);
    };
  }, [socket, fetchRequests]);

  // Poll for new requests every 30s + refetch when the tab becomes visible
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

  const handleDecision = async (requestId, action) => {
    setProcessing(requestId + action);
    try {
      await api.patch(`/manager/location-requests/${requestId}/decision`, { action, decisionNote: decisionNote || null });
      setMessage({ type: 'success', text: `Location request ${action}d.` });
      setExpanded(null);
      setDecisionNote('');
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed.' });
    } finally { setProcessing(null); }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Location Requests</h1>
          <p className="text-slate-600 text-sm mt-0.5">Review requests from team members to work from another office location.</p>
        </div>
        <button onClick={fetchRequests} className="btn-ghost text-sm"><RefreshCw size={14} /> Refresh</button>
      </div>

      {message && (
        <div className={`p-3 rounded-xl border text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {message.text}
        </div>
      )}

      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`btn text-xs capitalize ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-sky-600" size={28} /></div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-12 text-slate-500 shadow-sm">
          <MapPin size={32} className="mx-auto mb-3 opacity-40" />
          No {statusFilter} location requests from your team.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req._id} className="card border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === req._id ? null : req._id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin size={16} className="text-sky-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 text-sm">{req.userId?.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${req.requestType === 'temporary_access' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'}`}>
                        {req.requestType === 'temporary_access' ? 'Temporary' : 'Permanent'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{req.requestedLocationId?.officeName} · {new Date(req.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
                {expanded === req._id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>

              {expanded === req._id && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-slate-500 text-xs">Location</p><p className="text-slate-900 font-bold">{req.requestedLocationId?.officeName}</p></div>
                    {req.requestedFrom && <div><p className="text-slate-500 text-xs">From</p><p className="text-slate-900 font-bold">{new Date(req.requestedFrom).toLocaleDateString('en-IN')}</p></div>}
                    {req.requestedUntil && <div><p className="text-slate-500 text-xs">Until</p><p className="text-slate-900 font-bold">{new Date(req.requestedUntil).toLocaleDateString('en-IN')}</p></div>}
                    <div className="col-span-2"><p className="text-slate-500 text-xs mb-0.5">Reason</p><p className="text-slate-900 bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-medium">{req.reason}</p></div>
                  </div>

                  {req.status === 'pending' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Decision Note (optional)</label>
                        <input type="text" className="input w-full text-sm" placeholder="Add a note..." value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDecision(req._id, 'reject')} disabled={!!processing} className="btn-danger flex-1 text-sm">
                          {processing === req._id + 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                        </button>
                        <button onClick={() => handleDecision(req._id, 'approve')} disabled={!!processing} className="btn-success flex-1 text-sm">
                          {processing === req._id + 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

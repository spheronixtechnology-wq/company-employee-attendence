import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Smartphone, MapPin, CheckCircle, XCircle, Plus, Wifi, AlertCircle,
  RefreshCw, Search, ChevronDown, ChevronUp, User, Globe, Shield, Clock, Calendar
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

// --- 1. Device Requests Page ---
export const DeviceRequestsPage = () => {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState({});
  const [approvedUntils, setApprovedUntils] = useState({});
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/device-requests?status=${statusFilter}`);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      console.error('Error loading device requests:', err);
      setMessage({ type: 'error', text: 'Failed to load device requests from server.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchRequests();
    socket.on('device:request_created', handleUpdate);
    socket.on('device:request_resolved', handleUpdate);
    return () => {
      socket.off('device:request_created', handleUpdate);
      socket.off('device:request_resolved', handleUpdate);
    };
  }, [socket, fetchRequests]);

  // 30s polling + refetch on window visibility
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    }, 30000);
    const onVis = () => {
      if (document.visibilityState === 'visible' && !processing) fetchRequests();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchRequests, processing]);

  const handleDecision = async (id, action) => {
    setProcessing(id + action);
    try {
      const payload = {
        action,
        decisionNote: decisionNotes[id] || null,
      };
      if (approvedUntils[id] && action === 'approve') {
        payload.approvedUntil = new Date(approvedUntils[id]).toISOString();
      }
      await api.patch(`/admin/device-requests/${id}/decision`, payload);
      setMessage({ type: 'success', text: `Device request ${action}d successfully.` });
      setDecisionNotes((prev) => ({ ...prev, [id]: '' }));
      setApprovedUntils((prev) => ({ ...prev, [id]: '' }));
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || `Failed to ${action} request.` });
    } finally {
      setProcessing(null);
    }
  };

  const typeStyles = {
    register: 'bg-sky-50 text-sky-700 border-sky-200',
    replacement: 'bg-purple-50 text-purple-700 border-purple-200',
    temporary: 'bg-amber-50 text-amber-700 border-amber-200',
    lost: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  // Search filter
  const filteredRequests = requests.filter((req) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const userName = req.userId?.name?.toLowerCase() || '';
    const userEmail = req.userId?.email?.toLowerCase() || '';
    const device = req.requestedDeviceLabel?.toLowerCase() || '';
    const ip = req.ipAddress?.toLowerCase() || '';
    const reason = req.reason?.toLowerCase() || '';
    return userName.includes(term) || userEmail.includes(term) || device.includes(term) || ip.includes(term) || reason.includes(term);
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Smartphone className="text-primary-600" size={26} />
            Device Requests
          </h1>
          <p className="text-slate-600 text-sm mt-0.5">
            Review, verify, and approve employee mobile devices for company attendance access.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 self-start md:self-auto text-xs px-3.5 py-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
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
                  ? 'bg-primary-600 text-white shadow-sm'
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

        {/* Search Box */}
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

      {/* Feedback Message */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Main Content */}
      {loading && requests.length === 0 ? (
        <LoadingScreen />
      ) : filteredRequests.length === 0 ? (
        <div className="card text-center py-16 border border-slate-200 bg-white">
          <Smartphone size={38} className="mx-auto mb-3 text-slate-400" />
          <h3 className="text-slate-900 font-semibold text-base mb-1">No Device Requests Found</h3>
          <p className="text-slate-600 text-xs max-w-md mx-auto">
            {search.trim()
              ? `No requests match "${search}". Try clearing your search.`
              : `There are currently no ${statusFilter} device requests.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRequests.map((req) => {
            const isExp = expanded === req._id;
            const empName = req.userId?.name || 'Unknown Employee';
            const empEmail = req.userId?.email || '—';
            const teamName = req.userId?.teamId?.name || null;
            const isPending = req.status === 'pending';

            return (
              <div
                key={req._id}
                className="card border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all flex flex-col justify-between"
              >
                {/* Card Top */}
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 font-bold text-sm shadow-sm flex-shrink-0">
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

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${statusStyles[req.status] || statusStyles.pending}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>

                  {/* Device Info */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1.5">
                        <Smartphone size={13} className="text-primary-600" /> Device Model
                      </span>
                      <span className="text-slate-900 font-medium truncate max-w-[180px]">
                        {req.requestedDeviceLabel || 'Unknown Device'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Request Type</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${typeStyles[req.requestType] || typeStyles.replacement}`}>
                        {req.requestType}
                      </span>
                    </div>

                    {req.reason && (
                      <div className="text-xs pt-1 border-t border-slate-200">
                        <span className="text-slate-500 block mb-0.5 text-[11px]">Reason:</span>
                        <p className="text-slate-700 italic line-clamp-2">"{req.reason}"</p>
                      </div>
                    )}
                  </div>

                  {/* Expandable Technical Details */}
                  {isExp && (
                    <div className="pt-2 border-t border-slate-200 space-y-2 text-xs animate-in fade-in duration-150">
                      {req.ipAddress && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Globe size={12} className="text-sky-600" /> Request IP
                          </span>
                          <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                            {req.ipAddress}
                          </span>
                        </div>
                      )}

                      {req.deviceFingerprint && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Shield size={12} className="text-emerald-600" /> Fingerprint
                          </span>
                          <span className="font-mono text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-700">
                            {req.deviceFingerprint.slice(0, 14)}...
                          </span>
                        </div>
                      )}

                      {req.requestedUntil && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <Clock size={12} className="text-amber-600" /> Access Until
                          </span>
                          <span className="text-slate-800 font-medium">
                            {new Date(req.requestedUntil).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      )}

                      {req.decisionNote && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[11px] text-slate-500 block mb-0.5">Decision Note:</span>
                          <p className="text-slate-700">{req.decisionNote}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>Submitted:</span>
                        <span>{req.createdAt ? new Date(req.createdAt).toLocaleString('en-IN') : '—'}</span>
                      </div>
                    </div>
                  )}

                  {/* Toggle Expand */}
                  <button
                    onClick={() => setExpanded(isExp ? null : req._id)}
                    className="w-full flex items-center justify-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 pt-1 transition-colors"
                  >
                    {isExp ? (
                      <>Less Details <ChevronUp size={12} /></>
                    ) : (
                      <>More Details <ChevronDown size={12} /></>
                    )}
                  </button>
                </div>

                {/* Card Actions (for Pending Requests) */}
                {isPending && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Add note (optional)..."
                      value={decisionNotes[req._id] || ''}
                      onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [req._id]: e.target.value }))}
                      className="input w-full text-xs py-1.5 px-2.5 bg-white border-slate-200 rounded-lg text-slate-900"
                    />

                    {req.requestType === 'temporary' && (
                      <div>
                        <label className="text-[10px] text-slate-600 mb-0.5 block">Approve Access Until</label>
                        <input
                          type="date"
                          value={approvedUntils[req._id] || ''}
                          onChange={(e) => setApprovedUntils((prev) => ({ ...prev, [req._id]: e.target.value }))}
                          className="input w-full text-xs py-1 px-2 bg-white border-slate-200 rounded-lg text-slate-900"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecision(req._id, 'approve')}
                        disabled={!!processing}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {processing === req._id + 'approve' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle size={13} />
                        )}
                        Approve
                      </button>

                      <button
                        onClick={() => handleDecision(req._id, 'reject')}
                        disabled={!!processing}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {processing === req._id + 'reject' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
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
};


// --- 2. Office Locations Page ---
export const OfficeLocationsPage = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [detectedIpInfo, setDetectedIpInfo] = useState(null);
  const [form, setForm] = useState({
    officeName: '',
    latitude: '',
    longitude: '',
    radiusMeters: 200,
    wifiSsid: '',
    allowedIps: '',
  });
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/admin/office-locations');
      setLocations(res.data?.data?.locations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocations(); }, []);

  const handleSave = async () => {
    if (!form.officeName || !form.latitude || !form.longitude || !form.radiusMeters) {
      return alert('Office name, latitude, longitude, and radius are required');
    }
    setSaving(true);
    try {
      await api.post('/admin/office-locations', form);
      setShowAdd(false);
      setForm({
        officeName: '',
        latitude: '',
        longitude: '',
        radiusMeters: 200,
        wifiSsid: '',
        allowedIps: '',
      });
      setGpsAccuracy(null);
      setDetectedIpInfo(null);
      fetchLocations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoDetectIp = async () => {
    setDetectingIp(true);
    try {
      const res = await api.get('/admin/current-ip');
      const detected = res.data?.data?.ip;
      if (detected) {
        setDetectedIpInfo(detected);
        setForm((prev) => {
          const existing = prev.allowedIps
            ? prev.allowedIps.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
          if (!existing.includes(detected)) {
            const updated = [...existing, detected].join(', ');
            return { ...prev, allowedIps: updated };
          }
          return prev;
        });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to detect current IP');
    } finally {
      setDetectingIp(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;
    try {
      await api.delete(`/admin/office-locations/${id}`);
      fetchLocations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete location');
    }
  };

  const autoDetect = () => {
    if (!navigator.geolocation) return alert('Geolocation is not supported by your browser.');
    setDetecting(true);
    setGpsAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setGpsAccuracy(pos.coords.accuracy);
        setDetecting(false);
      },
      (err) => {
        alert('Failed to detect location. Please ensure location permissions are granted.');
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Header title="Office Locations" desc="Manage approved geofence locations for attendance." />
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Location
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 bg-white border border-slate-200 shadow-sm animate-fade-in mb-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Add New Office Location</h3>
          
          <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-slate-900 font-medium">Capture Coordinates</p>
              <p className="text-sm text-slate-600">Stand at the center of the office to auto-fill Lat/Lng.</p>
            </div>
            <button onClick={autoDetect} disabled={detecting} className="btn-ghost flex items-center gap-2 whitespace-nowrap">
              {detecting ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              {detecting ? 'Detecting...' : '📍 Use Current Location'}
            </button>
          </div>

          {gpsAccuracy !== null && (
            <div className={`mb-6 p-3 rounded-xl border flex items-start gap-3 text-sm ${gpsAccuracy > 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>±{Math.round(gpsAccuracy)}m GPS Accuracy.</strong>
                {gpsAccuracy > 50 && ' Low accuracy — stand near a window or enter coordinates manually.'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="label">Location Name</label>
              <input placeholder="e.g. Headquarters" className="input" value={form.officeName} onChange={e => setForm({...form, officeName: e.target.value})} />
            </div>
            <div>
              <label className="label">Latitude</label>
              <input type="number" step="any" placeholder="Latitude" className="input" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input type="number" step="any" placeholder="Longitude" className="input" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
            </div>
            <div>
              <label className="label">Radius (m)</label>
              <input type="number" placeholder="Radius (m)" className="input" value={form.radiusMeters} onChange={e => setForm({...form, radiusMeters: e.target.value})} />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 mb-4 space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Wifi size={16} className="text-primary-600" /> Authorized Office Network Configuration
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Office WiFi Name (SSID)</label>
                <input
                  placeholder="e.g. Spheronix-Office-5G"
                  className="input"
                  value={form.wifiSsid}
                  onChange={e => setForm({...form, wifiSsid: e.target.value})}
                />
                <p className="text-[11px] text-slate-500 mt-1">Display guidance label telling employees which network to join.</p>
              </div>

              <div>
                <label className="label">Allowed Public IP(s) / CIDR Subnets</label>
                <input
                  placeholder="e.g. 103.5.135.77, 103.5.135.64/28"
                  className="input font-mono text-xs"
                  value={form.allowedIps}
                  onChange={e => setForm({...form, allowedIps: e.target.value})}
                />
                <p className="text-[11px] text-slate-500 mt-1">Authorized office router public egress IP(s) or CIDRs (comma-separated).</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Wifi size={16} className="text-primary-600" />
                  <span className="text-sm font-semibold text-slate-900">Auto-Detect Office Public IP</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Captures the public egress IP of your current internet connection and appends it to Allowed IPs.
                </p>
                {detectedIpInfo && (
                  <p className="text-xs text-emerald-700 font-medium mt-1">
                    ✅ Detected Public IP: <span className="font-mono text-slate-900">{detectedIpInfo}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAutoDetectIp}
                disabled={detectingIp}
                className="btn-ghost text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {detectingIp ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                {detectingIp ? 'Detecting...' : 'Detect Current IP'}
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Warning:</strong> Make sure you are connected to the official office network before using auto-detect. If configuring remotely from home, enter your office static public IP manually.
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin mr-2 inline" /> : null}
              Save Location
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.length === 0 ? <EmptyState msg="No office locations configured." /> : 
          locations.map(loc => (
            <div key={loc._id} className="card p-6 border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
                      <MapPin size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{loc.officeName}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {loc.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(loc._id)} className="text-slate-400 hover:text-rose-600 p-2 transition-colors" title="Delete Location">
                    <XCircle size={20} />
                  </button>
                </div>
                <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex justify-between"><span>Latitude:</span> <span className="text-slate-900 font-mono">{loc.latitude}</span></div>
                  <div className="flex justify-between"><span>Longitude:</span> <span className="text-slate-900 font-mono">{loc.longitude}</span></div>
                  <div className="flex justify-between"><span>Radius:</span> <span className="text-slate-900">{loc.radiusMeters}m</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5"><span>WiFi SSID:</span> <span className="text-sky-700 font-medium">{loc.wifiSsid || 'Not set'}</span></div>
                  <div className="flex flex-col border-t border-slate-200 pt-1.5">
                    <span className="text-xs text-slate-500 mb-0.5">Allowed Public IPs:</span>
                    <span className="text-xs font-mono text-emerald-700 break-all">
                      {loc.allowedIps && loc.allowedIps.length > 0 ? loc.allowedIps.join(', ') : 'None configured'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
};



// --- 3. Location Requests Page ---
export const LocationRequestsPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/admin/location-requests?status=pending').catch(() => ({ data: { data: { requests: [
        { _id: '1', userId: { name: 'Charlie Brown', email: 'charlie@example.com' }, requestedUntil: '2026-09-08', requestType: 'temporary_access' },
      ] } } }));
      setRequests(res.data?.data?.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleDecision = async (id, decision) => {
    setRequests(prev => prev.filter(r => r._id !== id));
    // In real app: await api.post(`/admin/location-requests/${id}/decision`, { decision });
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Location Access Requests" desc="Review and approve temporary work-from-anywhere or alternate location requests." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {requests.length === 0 ? <EmptyState msg="No pending location requests." /> : 
          requests.map(req => (
            <RequestCard 
              key={req._id}
              icon={<MapPin className="text-emerald-600" size={24} />}
              title={req.userId?.name}
              subtitle={req.userId?.email}
              details={[
                { label: 'Type', value: req.requestType.replace('_', ' ') },
                { label: 'Requested Until', value: req.requestedUntil }
              ]}
              onApprove={() => handleDecision(req._id, 'approved')}
              onReject={() => handleDecision(req._id, 'rejected')}
            />
          ))
        }
      </div>
    </div>
  );
};

// --- Shared UI Components ---

const Header = ({ title, desc }) => (
  <div>
    <h1 className="text-3xl font-extrabold text-slate-900 mb-2">{title}</h1>
    <p className="text-slate-600 text-sm">{desc}</p>
  </div>
);

const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-[500px]">
    <Loader2 className="animate-spin text-primary-600" size={40} />
  </div>
);

const EmptyState = ({ msg }) => (
  <div className="col-span-full card text-center p-8 border border-slate-200 bg-white">
    <p className="text-slate-500">{msg}</p>
  </div>
);

const RequestCard = ({ icon, title, subtitle, details, onApprove, onReject }) => (
  <div className="card p-5 border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all hover:border-slate-300">
    <div className="flex items-center gap-4 mb-5">
      <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-slate-700">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg leading-tight">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
    
    <div className="space-y-2 mb-6">
      {details.map((d, i) => (
        <div key={i} className="flex justify-between items-center text-sm">
          <span className="text-slate-500">{d.label}:</span>
          <span className="text-slate-800 font-medium capitalize">{d.value}</span>
        </div>
      ))}
    </div>

    <div className="flex gap-3">
      <button onClick={onApprove} className="flex-1 py-2 px-4 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 font-semibold text-sm border border-emerald-200">
        <CheckCircle size={16} /> Approve
      </button>
      <button onClick={onReject} className="flex-1 py-2 px-4 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2 font-semibold text-sm border border-rose-200">
        <XCircle size={16} /> Reject
      </button>
    </div>
  </div>
);

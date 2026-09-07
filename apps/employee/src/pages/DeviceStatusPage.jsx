import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { useSocket } from '../contexts/SocketContext';
import {
  Smartphone, CheckCircle, Clock, XCircle, AlertTriangle,
  RefreshCw, ChevronRight, Loader2, Shield, Calendar,
  ArrowLeft, Send, Trash2
} from 'lucide-react';

const STATUS_CONFIG = {
  active:    { label: 'Trusted Device', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40', dot: 'bg-emerald-400' },
  temporary: { label: 'Temporary Device', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/40', dot: 'bg-amber-400' },
  pending:   { label: 'Pending Approval', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/40', dot: 'bg-blue-400' },
  none:      { label: 'No Device Registered', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/40', dot: 'bg-red-400' },
};

const REQUEST_REASONS = {
  temporary: ['Forgot my phone at home', 'Phone battery is dead', 'Phone is damaged', 'Phone is unavailable', 'Other reason'],
  replacement: ['Bought a new phone', 'Old phone is damaged beyond repair', 'Phone was stolen/lost', 'Device upgrade', 'Other reason'],
  lost: ['Phone lost', 'Phone stolen'],
};

export default function DeviceStatusPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [showRequestForm, setShowRequestForm] = useState(null); // 'temporary' | 'replacement' | 'lost'
  const [formData, setFormData] = useState({ reason: '', otherReason: '', requestedUntil: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const { socket } = useSocket();

  useEffect(() => { fetchStatus(); }, []);

  // Real-time listener for manager decisions
  useEffect(() => {
    if (!socket) return;
    const onResolved = (data) => {
      fetchStatus();
      if (data.action === 'approve') {
        setMessage({ type: 'success', text: 'Device approved by manager!' });
      } else if (data.action === 'reject') {
        setMessage({ type: 'error', text: `Device request rejected: ${data.decisionNote || 'No note provided'}` });
      }
    };
    socket.on('device:request_resolved', onResolved);
    return () => {
      socket.off('device:request_resolved', onResolved);
    };
  }, [socket]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, requestsRes] = await Promise.all([
        api.get('/employee/device-status'),
        api.get('/employee/device-requests'),
      ]);
      setDeviceStatus(statusRes.data.data.deviceStatus);
      setPendingRequest(statusRes.data.data.pendingRequest);
      setMyRequests(requestsRes.data.data.requests || []);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load device status.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    const finalReason = formData.reason === 'Other reason' ? formData.otherReason : formData.reason;
    if (!finalReason.trim()) { setMessage({ type: 'error', text: 'Please select or enter a reason.' }); return; }

    setSubmitting(true);
    try {
      const fp = await getDeviceFingerprint();
      const payload = {
        requestType: showRequestForm,
        reason: finalReason,
        deviceFingerprint: fp,
      };
      if (showRequestForm === 'temporary' && formData.requestedUntil) {
        payload.requestedUntil = new Date(formData.requestedUntil).toISOString();
      }
      await api.post('/employee/device-requests', payload);
      setMessage({ type: 'success', text: showRequestForm === 'lost'
        ? 'Your device has been reported as lost. A replacement request has been submitted.'
        : `${showRequestForm === 'temporary' ? 'Temporary device' : 'Device replacement'} request submitted. You will be notified once approved.`
      });
      setShowRequestForm(null);
      setFormData({ reason: '', otherReason: '', requestedUntil: '' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit request.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-64">
        <Loader2 size={32} className="animate-spin text-primary-400" />
      </div>
    );
  }

  const statusType = deviceStatus?.statusType || 'none';
  const cfg = STATUS_CONFIG[statusType] || STATUS_CONFIG.none;
  const device = deviceStatus?.device;

  return (
    <div className="page-container max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title">Attendance Device</h1>
          <p className="page-subtitle">Manage your trusted mobile device for attendance</p>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
          <p>{message.text}</p>
        </div>
      )}

      {/* Device Status Card */}
      <div className={`card border ${cfg.bg}`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-700/60 flex items-center justify-center flex-shrink-0">
            <Smartphone size={26} className={cfg.color} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
              <span className={`font-bold text-lg ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-sm text-slate-400">
              {statusType === 'active' && 'This device is registered and authorized for attendance.'}
              {statusType === 'temporary' && `Temporary access until ${device?.temporaryUntil ? new Date(device.temporaryUntil).toLocaleDateString('en-IN') : 'N/A'}`}
              {statusType === 'pending' && 'Your device registration is awaiting admin approval.'}
              {statusType === 'none' && 'You have no registered device. Register your mobile phone to mark attendance.'}
            </p>
          </div>
        </div>

        {device && (
          <div className="space-y-3 p-4 bg-slate-800/60 rounded-2xl mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Device Name</span>
              <span className="text-white font-medium">{device.deviceLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Registered</span>
              <span className="text-white">{new Date(device.registeredAt).toLocaleDateString('en-IN')}</span>
            </div>
            {device.lastUsedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Last Used</span>
                <span className="text-white">{new Date(device.lastUsedAt).toLocaleDateString('en-IN')}</span>
              </div>
            )}
            {device.temporaryUntil && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Access Until</span>
                <span className="text-amber-400 font-medium">{new Date(device.temporaryUntil).toLocaleDateString('en-IN')}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {statusType === 'none' && (
          <button onClick={() => navigate('/device-onboarding')} className="btn-primary w-full">
            <Smartphone size={16} /> Register Your Device
          </button>
        )}

        {(statusType === 'active' || statusType === 'temporary') && !pendingRequest && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => { setShowRequestForm('temporary'); setMessage(null); }}
              className="btn-ghost text-sm py-3 flex flex-col items-center gap-1.5"
            >
              <Clock size={18} className="text-amber-400" />
              <span>Request Temporary Device</span>
            </button>
            <button
              onClick={() => { setShowRequestForm('replacement'); setMessage(null); }}
              className="btn-ghost text-sm py-3 flex flex-col items-center gap-1.5"
            >
              <RefreshCw size={18} className="text-primary-400" />
              <span>Request Replacement</span>
            </button>
            <button
              onClick={() => { setShowRequestForm('lost'); setMessage(null); }}
              className="btn-ghost text-sm py-3 flex flex-col items-center gap-1.5"
            >
              <XCircle size={18} className="text-red-400" />
              <span>Report Device Lost</span>
            </button>
          </div>
        )}

        {pendingRequest && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm text-blue-400 text-center">
            <Clock size={14} className="inline mr-1" />
            You have a pending <strong>{pendingRequest.requestType}</strong> request awaiting approval.
          </div>
        )}
      </div>

      {/* Request Form */}
      {showRequestForm && (
        <div className="card border border-slate-700 animate-in slide-in-from-bottom-4 duration-300">
          <h3 className="font-bold text-white text-lg mb-2">
            {showRequestForm === 'temporary' && 'Request Temporary Device Access'}
            {showRequestForm === 'replacement' && 'Request Device Replacement'}
            {showRequestForm === 'lost' && 'Report Device Lost'}
          </h3>

          {showRequestForm === 'lost' && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 mb-4">
              <AlertTriangle size={14} className="inline mr-1" />
              Reporting your device as lost will <strong>immediately block it</strong> from being used for attendance.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Reason</label>
              <select
                className="input w-full"
                value={formData.reason}
                onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))}
              >
                <option value="">Select a reason...</option>
                {(REQUEST_REASONS[showRequestForm] || []).map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {formData.reason === 'Other reason' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Please describe</label>
                <textarea
                  className="input w-full min-h-[80px] resize-none"
                  placeholder="Enter your reason..."
                  value={formData.otherReason}
                  onChange={e => setFormData(p => ({ ...p, otherReason: e.target.value }))}
                />
              </div>
            )}

            {showRequestForm === 'temporary' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Requested Until <span className="text-slate-500">(optional — default is end of today)</span>
                </label>
                <input
                  type="date"
                  className="input w-full"
                  value={formData.requestedUntil}
                  onChange={e => setFormData(p => ({ ...p, requestedUntil: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowRequestForm(null)} className="btn-ghost flex-1">Cancel</button>
            <button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className={`flex-1 ${showRequestForm === 'lost' ? 'btn-danger' : 'btn-primary'}`}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {showRequestForm === 'lost' ? 'Report Lost Device' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Request History */}
      {myRequests.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" /> Request History
          </h3>
          <div className="space-y-3">
            {myRequests.slice(0, 5).map(req => (
              <div key={req._id} className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white capitalize">{req.requestType.replace('_', ' ')} Request</p>
                  <p className="text-xs text-slate-400">{new Date(req.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <span className={`badge text-xs capitalize ${
                  req.status === 'approved' ? 'badge-success' :
                  req.status === 'rejected' ? 'badge-error' :
                  req.status === 'pending' ? 'badge-warning' : 'badge-neutral'
                }`}>{req.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="card bg-slate-800/30">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <Shield size={16} className="text-primary-400" /> How Attendance Works
        </h3>
        <ol className="space-y-3">
          {[
            'Register your trusted mobile device (this screen).',
            'Bring this device with you to the office each day.',
            'Make sure location permission is enabled on your phone.',
            'If QR attendance is enabled, scan the QR code displayed at your office entrance.',
            'The system verifies your device and location automatically.',
            'Attendance is recorded after successful verification.',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
              <span className="w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-6 p-3 bg-slate-800/60 rounded-xl">
          <p className="text-xs text-slate-500 mb-2 font-semibold text-slate-400">Need to use another device?</p>
          <div className="grid grid-cols-2 gap-2">
            {(statusType === 'active' || statusType === 'temporary') && !pendingRequest && (
              <>
                <button onClick={() => { setShowRequestForm('temporary'); setMessage(null); }} className="btn-ghost text-xs py-2">
                  Request Temporary Device
                </button>
                <button onClick={() => { setShowRequestForm('replacement'); setMessage(null); }} className="btn-ghost text-xs py-2">
                  Replace Device
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

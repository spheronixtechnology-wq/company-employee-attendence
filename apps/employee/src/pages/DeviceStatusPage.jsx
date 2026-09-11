import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { useSocket } from '../contexts/SocketContext';
import {
  Smartphone, CheckCircle, Clock, XCircle, AlertTriangle,
  RefreshCw, Loader2, Shield, Calendar,
  ArrowLeft, Send
} from 'lucide-react';
import { getDeviceInfo } from '../lib/deviceNames';

const STATUS_CONFIG = {
  active:    { label: 'Trusted Device', color: 'text-emerald-500', bg: 'bg-emerald-50/80 border-emerald-100', dot: 'bg-emerald-400' },
  temporary: { label: 'Temporary Device', color: 'text-amber-500', bg: 'bg-amber-50/80 border-amber-100', dot: 'bg-amber-400' },
  pending:   { label: 'Pending Approval', color: 'text-sky-500', bg: 'bg-sky-50/80 border-sky-100', dot: 'bg-sky-400' },
  none:      { label: 'No Device Registered', color: 'text-rose-500', bg: 'bg-rose-50/80 border-rose-100', dot: 'bg-rose-400' },
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
      const devInfo = await getDeviceInfo();
      const fullLabel = devInfo.model ? `${devInfo.model} · ${devInfo.os}`.slice(0, 80) : devInfo.os.slice(0, 80);

      const payload = {
        requestType: showRequestForm,
        reason: finalReason,
        deviceFingerprint: fp,
        requestedDeviceLabel: fullLabel,
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
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    );
  }

  const statusType = deviceStatus?.statusType || 'none';
  const cfg = STATUS_CONFIG[statusType] || STATUS_CONFIG.none;
  const device = deviceStatus?.device;

  return (
    <div className="relative page-container max-w-7xl mx-auto space-y-6">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2.5">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title text-slate-800">Attendance Device</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage your trusted mobile device for attendance</p>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${
          message.type === 'success' ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600' : 'bg-rose-50/80 border-rose-100 text-rose-600'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
          <p>{message.text}</p>
        </div>
      )}

      {/* Horizontal 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Device Status Card */}
      <div className={`card border ${cfg.bg} shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] lg:col-start-1 lg:row-start-1`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-3xl bg-white/90 shadow-[0_6px_18px_-8px_rgba(148,163,184,0.5)] flex items-center justify-center flex-shrink-0">
            <Smartphone size={26} className={cfg.color} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
              <span className={`font-bold text-lg ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-sm text-slate-500">
              {statusType === 'active' && 'This device is registered and authorized for attendance.'}
              {statusType === 'temporary' && `Temporary access until ${device?.temporaryUntil ? new Date(device.temporaryUntil).toLocaleDateString('en-IN') : 'N/A'}`}
              {statusType === 'pending' && 'Your device registration is awaiting admin approval.'}
              {statusType === 'none' && 'You have no registered device. Register your mobile phone to mark attendance.'}
            </p>
          </div>
        </div>

        {device && (
          <div className="space-y-3 p-4 bg-white/70 border border-white/90 rounded-2xl mb-6 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)]">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Device Name</span>
              <span className="text-slate-800 font-semibold">{device.deviceLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Registered</span>
              <span className="text-slate-800 font-semibold">{new Date(device.registeredAt).toLocaleDateString('en-IN')}</span>
            </div>
            {device.lastUsedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Last Used</span>
                <span className="text-slate-800 font-semibold">{new Date(device.lastUsedAt).toLocaleDateString('en-IN')}</span>
              </div>
            )}
            {device.temporaryUntil && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Access Until</span>
                <span className="text-amber-600 font-semibold">{new Date(device.temporaryUntil).toLocaleDateString('en-IN')}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
            <button
              onClick={() => { setShowRequestForm('temporary'); setMessage(null); }}
              className="group flex flex-col items-center justify-center gap-2.5 rounded-3xl bg-white/90 border border-white/90 py-5 px-3 text-center shadow-[0_6px_18px_-8px_rgba(148,163,184,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_12px_28px_-10px_rgba(245,158,11,0.45)] hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.97]"
            >
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(245,158,11,0.4)] group-hover:scale-110 transition-transform duration-300">
                <Clock size={18} />
              </span>
              <span className="text-[13px] font-semibold text-slate-600 leading-snug">Request Temporary Device</span>
            </button>
            <button
              onClick={() => { setShowRequestForm('replacement'); setMessage(null); }}
              className="group flex flex-col items-center justify-center gap-2.5 rounded-3xl bg-white/90 border border-white/90 py-5 px-3 text-center shadow-[0_6px_18px_-8px_rgba(148,163,184,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_12px_28px_-10px_rgba(14,165,233,0.45)] hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.97]"
            >
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)] group-hover:scale-110 transition-transform duration-300">
                <RefreshCw size={18} />
              </span>
              <span className="text-[13px] font-semibold text-slate-600 leading-snug">Request Replacement</span>
            </button>
            <button
              onClick={() => { setShowRequestForm('lost'); setMessage(null); }}
              className="group flex flex-col items-center justify-center gap-2.5 rounded-3xl bg-white/90 border border-white/90 py-5 px-3 text-center shadow-[0_6px_18px_-8px_rgba(148,163,184,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_12px_28px_-10px_rgba(244,63,94,0.45)] hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.97]"
            >
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 text-rose-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(244,63,94,0.4)] group-hover:scale-110 transition-transform duration-300">
                <XCircle size={18} />
              </span>
              <span className="text-[13px] font-semibold text-slate-600 leading-snug">Report Device Lost</span>
            </button>
          </div>
        )}

        {pendingRequest && (
          <div className="p-3 bg-sky-50/80 border border-sky-100 rounded-2xl text-sm text-sky-600 text-center">
            <Clock size={14} className="inline mr-1" />
            You have a pending <strong>{pendingRequest.requestType}</strong> request awaiting approval.
          </div>
        )}
      </div>

      {/* Request Form — spans full width beneath the row */}
      {showRequestForm && (
        <div className="lg:col-span-3 bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] animate-in slide-in-from-bottom-4 duration-300">
          <h3 className="font-bold text-slate-800 text-lg mb-2">
            {showRequestForm === 'temporary' && 'Request Temporary Device Access'}
            {showRequestForm === 'replacement' && 'Request Device Replacement'}
            {showRequestForm === 'lost' && 'Report Device Lost'}
          </h3>

          {showRequestForm === 'lost' && (
            <div className="p-3 bg-rose-50/80 border border-rose-100 rounded-2xl text-sm text-rose-600 mb-4">
              <AlertTriangle size={14} className="inline mr-1" />
              Reporting your device as lost will <strong>immediately block it</strong> from being used for attendance.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Reason</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Please describe</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">
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
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] lg:col-start-2 lg:row-start-1">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-violet-500" /> Request History
          </h3>
          <div className="space-y-2">
            {myRequests.slice(0, 5).map(req => (
              <div key={req._id} className="flex items-center justify-between p-3 bg-white/70 border border-violet-50 rounded-2xl hover:shadow-[0_6px_18px_-8px_rgba(139,92,246,0.35)] transition-all">
                <div>
                  <p className="text-sm font-bold text-slate-800 capitalize">{req.requestType.replace('_', ' ')} Request</p>
                  <p className="text-xs text-slate-400">{new Date(req.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${
                  req.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                  req.status === 'rejected' ? 'bg-rose-50 text-rose-600' :
                  req.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                }`}>{req.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] lg:col-start-3 lg:row-start-1">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-violet-500" /> How Attendance Works
        </h3>
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-violet-500" /> How Attendance Works
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
            <li key={i} className="flex items-start gap-3 text-sm text-slate-500">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-6 p-3 bg-violet-50/60 border border-violet-100 rounded-2xl">
          <p className="text-xs font-semibold text-slate-600 mb-2">Need to use another device?</p>
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
    </div>
  );
}

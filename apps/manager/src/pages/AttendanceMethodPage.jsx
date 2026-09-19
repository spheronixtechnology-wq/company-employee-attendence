import { useState, useEffect } from 'react';
import {
  QrCode, Wifi, Smartphone, Fingerprint, CheckCircle2,
  ShieldCheck, Loader2, Activity, Check, X, ShieldAlert
} from 'lucide-react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

const methods = [
  {
    key: 'qr_code',
    label: 'QR Code Attendance',
    icon: QrCode,
    desc: 'Daily dynamic rotating QR code. Employees scan the office QR display at check-in.',
    badge: 'Popular',
  },
  {
    key: 'wifi_ip',
    label: 'WiFi / IP Network Gate',
    icon: Wifi,
    desc: 'Validates employee presence on approved office Wi-Fi networks by checking IP/subnet match.',
    badge: 'Zero-touch',
  },
  {
    key: 'biometric',
    label: 'Biometric (WebAuthn / FIDO2)',
    icon: Fingerprint,
    desc: 'Device-owner biometric verification using hardware sensors (Fingerprint, TouchID, FaceID, or PIN).',
    badge: 'High Security',
  },
];

export default function AttendanceMethodPage() {
  const { socket } = useSocket();
  const [current, setCurrent] = useState(null);
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false);
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(8);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [togglingHeartbeat, setTogglingHeartbeat] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  const fetchActiveMethod = async () => {
    try {
      const res = await api.get('/manager/attendance-method/active');
      const data = res.data?.data;
      setCurrent(data?.activeMethod);
      setHeartbeatEnabled(data?.heartbeatMonitoringEnabled === true);
      setHeartbeatTimeout(data?.heartbeatTimeoutMinutes || 8);
    } catch (err) {
      console.error('Failed to load active attendance method:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveMethod();
  }, []);

  // Listen for real-time configuration updates across manager/admin sessions
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (data) => {
      if (data?.activeMethod) setCurrent(data.activeMethod);
      if (typeof data?.heartbeatMonitoringEnabled === 'boolean') {
        setHeartbeatEnabled(data.heartbeatMonitoringEnabled);
      }
      if (typeof data?.heartbeatTimeoutMinutes === 'number') {
        setHeartbeatTimeout(data.heartbeatTimeoutMinutes);
      }
    };
    socket.on('attendance-setting:updated', handleUpdate);
    return () => {
      socket.off('attendance-setting:updated', handleUpdate);
    };
  }, [socket]);

  const handleSwitchMethod = async (methodKey) => {
    const methodObj = methods.find(m => m.key === methodKey);
    const reason = prompt(`Reason for switching attendance verification method to "${methodObj?.label || methodKey}"?`);
    if (!reason || !reason.trim()) return;

    setSwitching(true);
    try {
      await api.patch('/manager/attendance-method/switch', { method: methodKey, reason: reason.trim() });
      setCurrent(methodKey);
      setFeedbackMessage({
        type: 'success',
        text: `Attendance method successfully switched to ${methodObj?.label || methodKey}.`
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to switch attendance method');
    } finally {
      setSwitching(false);
    }
  };

  const handleToggleHeartbeat = async () => {
    const nextState = !heartbeatEnabled;
    setTogglingHeartbeat(true);
    try {
      const res = await api.patch('/manager/attendance-method/heartbeat', {
        enabled: nextState,
        timeoutMinutes: heartbeatTimeout,
      });
      const payload = res.data?.data;
      const isEnabled = payload?.heartbeatMonitoringEnabled === true;
      setHeartbeatEnabled(isEnabled);
      setFeedbackMessage({
        type: isEnabled ? 'success' : 'info',
        text: isEnabled
          ? 'Workstation heartbeat monitoring turned ON. Sessions will be checked every minute.'
          : 'Heartbeat monitoring turned OFF. Heartbeat checkouts are bypassed; phone locks will not close sessions.'
      });
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle heartbeat monitoring');
    } finally {
      setTogglingHeartbeat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-violet-400" size={36} />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6 animate-fade-in pb-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-50 text-violet-600 border border-violet-200 shadow-xs">
              <ShieldCheck size={24} />
            </span>
            Attendance Verification Method
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Configure the default check-in mode and workstation continuous presence monitoring across the organization.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-600 font-medium">Active Mode:</span>
          <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">
            {current ? current.replace(/_/g, ' ') : 'Loading...'}
          </span>
        </div>
      </div>

      {/* Toast Feedback Alert */}
      {feedbackMessage && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-medium transition-all ${
          feedbackMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-slate-100 text-slate-800 border-slate-200'
        }`}>
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          ) : (
            <ShieldAlert size={18} className="text-slate-600 flex-shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* ──────────────── Continuous Workstation Presence & Heartbeat Monitoring ──────────────── */}
      <div className={`card p-6 rounded-2xl border transition-all duration-300 ${
        heartbeatEnabled 
          ? 'bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40 border-emerald-300 shadow-xs' 
          : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-3.5 rounded-2xl flex-shrink-0 transition-colors ${
              heartbeatEnabled 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' 
                : 'bg-slate-100 text-slate-500'
            }`}>
              <Activity size={26} className={heartbeatEnabled ? 'animate-pulse' : ''} />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900">
                  Continuous Presence & Workstation Heartbeat
                </h2>
                {heartbeatEnabled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Heartbeat Active ({heartbeatTimeout}m Timeout)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Heartbeat Inactive (No auto-checkout on phone lock)
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
                When turned <strong>ON</strong>, the system monitors employee presence heartbeats and can automatically check out sessions after prolonged loss of signal.
                When turned <strong>OFF</strong>, heartbeat checking is deactivated, allowing employees to lock their mobile devices without getting logged out.
              </p>
            </div>
          </div>

          {/* Interactive Toggle Switch */}
          <div className="flex items-center gap-3 self-end lg:self-center">
            <span className={`text-xs font-bold tracking-wide uppercase ${
              heartbeatEnabled ? 'text-emerald-700' : 'text-slate-400'
            }`}>
              {heartbeatEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              type="button"
              id="toggle-heartbeat-monitoring-btn"
              disabled={togglingHeartbeat}
              onClick={handleToggleHeartbeat}
              className={`relative inline-flex h-8 w-15 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 ${
                heartbeatEnabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={heartbeatEnabled}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                  heartbeatEnabled ? 'translate-x-7' : 'translate-x-0'
                }`}
              >
                {togglingHeartbeat ? (
                  <Loader2 size={13} className="animate-spin text-slate-500" />
                ) : heartbeatEnabled ? (
                  <Check size={13} className="text-emerald-600 font-bold" />
                ) : (
                  <X size={13} className="text-slate-400 font-bold" />
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────── Verification Mode Cards ──────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-slate-500">
          Default Check-In Verification Methods
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {methods.map(m => {
            const Icon = m.icon;
            const isActive = current === m.key;

            return (
              <div
                key={m.key}
                className={`card relative transition-all duration-200 p-5 border ${
                  isActive
                    ? 'border-violet-500 bg-violet-50/40 shadow-md ring-1 ring-violet-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-3 rounded-xl ${
                        isActive ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Icon size={24} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{m.label}</h3>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {m.badge}
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                      <CheckCircle2 size={13} /> Active
                    </span>
                  )}
                </div>

                <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                  {m.desc}
                </p>

                <div>
                  {isActive ? (
                    <div className="text-center py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                      Currently enforced as manager default
                    </div>
                  ) : (
                    <button
                      id={`switch-to-${m.key}`}
                      disabled={switching}
                      onClick={() => handleSwitchMethod(m.key)}
                      className="btn bg-slate-50 hover:bg-violet-600 hover:text-white text-slate-800 text-xs w-full py-2.5 transition-colors font-semibold border border-slate-200 shadow-xs"
                    >
                      {switching ? 'Updating...' : `Set ${m.label} as Default`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

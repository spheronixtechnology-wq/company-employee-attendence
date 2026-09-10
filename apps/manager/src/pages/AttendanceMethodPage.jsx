import { useState, useEffect } from 'react';
import { QrCode, Wifi, Smartphone, Fingerprint, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../lib/api';

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
  // {
  //   key: 'device_fingerprint',
  //   label: 'Device Fingerprint Lock',
  //   icon: Smartphone,
  //   desc: 'Binds employee check-in exclusively to pre-registered and approved hardware devices.',
  //   badge: 'Strict Trust',
  // },
  {
    key: 'biometric',
    label: 'Biometric (WebAuthn / FIDO2)',
    icon: Fingerprint,
    desc: 'Device-owner biometric verification using hardware sensors (Fingerprint, TouchID, FaceID, or PIN).',
    badge: 'High Security',
  },
];

export default function AttendanceMethodPage() {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchActiveMethod = async () => {
    try {
      const res = await api.get('/manager/attendance-method/active');
      setCurrent(res.data?.data?.activeMethod);
    } catch (err) {
      console.error('Failed to load active attendance method:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveMethod();
  }, []);

  const handleSwitchMethod = async (methodKey) => {
    const methodObj = methods.find(m => m.key === methodKey);
    const reason = prompt(`Reason for switching attendance verification method to "${methodObj?.label || methodKey}"?`);
    if (!reason || !reason.trim()) return;

    setSwitching(true);
    try {
      await api.patch('/manager/attendance-method/switch', { method: methodKey, reason: reason.trim() });
      setCurrent(methodKey);
      alert(`Attendance method switched to ${methodObj?.label || methodKey} successfully!`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to switch attendance method');
    } finally {
      setSwitching(false);
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
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
              <ShieldCheck size={24} />
            </span>
            Attendance Verification Method
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure the required verification mode for all employee check-ins across the organization.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">Active Mode:</span>
          <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
            {current ? current.replace('_', ' ') : 'Loading...'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {methods.map(m => {
          const Icon = m.icon;
          const isActive = current === m.key;

          return (
            <div
              key={m.key}
              className={`card relative transition-all duration-200 p-5 ${
                isActive
                  ? 'border-violet-500 bg-gradient-to-br from-violet-950/40 via-slate-800/80 to-slate-800 shadow-lg shadow-violet-900/20 ring-1 ring-violet-500/50'
                  : 'hover:border-slate-600 bg-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl ${
                      isActive ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{m.label}</h3>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      {m.badge}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                    <CheckCircle2 size={13} /> Active
                  </span>
                )}
              </div>

              <p className="text-slate-300 text-sm mb-5 leading-relaxed">
                {m.desc}
              </p>

              <div>
                {isActive ? (
                  <div className="text-center py-2 text-xs font-medium text-emerald-400/90 bg-emerald-950/30 rounded-xl border border-emerald-500/20">
                    Currently enforced at employee check-in
                  </div>
                ) : (
                  <button
                    id={`switch-to-${m.key}`}
                    disabled={switching}
                    onClick={() => handleSwitchMethod(m.key)}
                    className="btn bg-slate-700 hover:bg-violet-600 hover:text-white text-slate-200 text-xs w-full py-2.5 transition-colors font-semibold"
                  >
                    {switching ? 'Updating...' : `Switch to ${m.label}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

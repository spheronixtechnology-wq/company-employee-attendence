import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Eye, EyeOff, LogIn, Loader2, Smartphone, ShieldAlert,
  CheckCircle, XCircle, ArrowLeft, Send, RefreshCw, AlertCircle
} from 'lucide-react';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { getDeviceInfo } from '../lib/deviceNames';
import api from '../lib/api';
import { io } from 'socket.io-client';

const PRESET_REASONS = [
  'Bought a new phone',
  'Old phone is damaged',
  'Old phone lost or stolen',
  'Device replacement',
  'Other reason'
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Mode: 'login' | 'mismatch' | 'pending' | 'approved'
  const [viewMode, setViewMode] = useState('login');

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Device mismatch details
  const [mismatchData, setMismatchData] = useState(null);
  const [requestReason, setRequestReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Pending request details
  const [pendingReqId, setPendingReqId] = useState(null);
  const [rejectionNote, setRejectionNote] = useState(null);
  const socketRef = useRef(null);

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Listen on guest socket for live decision
  useEffect(() => {
    if (viewMode !== 'pending' || !pendingReqId) return;

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const socketUrl = isHttps ? undefined : (import.meta.env.VITE_BACKEND_URL || undefined);
    const socket = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('⚡ [Login Guest Socket] Connected, joining room for req:', pendingReqId);
      socket.emit('join:device_request', pendingReqId);
    });

    socket.on('device:request_resolved', (data) => {
      console.log('⚡ [Login Guest Socket] Device request resolved:', data);
      if (data.action === 'approve') {
        setViewMode('approved');
      } else if (data.action === 'reject') {
        setRejectionNote(data.decisionNote || 'Request was declined by manager.');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [viewMode, pendingReqId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Gather device context
      const fp = await getDeviceFingerprint();
      const info = await getDeviceInfo();
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const deviceLabel = [info?.model, info?.os].filter(Boolean).join(' · ') || navigator.userAgent;

      // 2. Attempt login with device fingerprint
      await login(form.email, form.password, {
        deviceFingerprint: fp,
        deviceLabel,
        isMobile,
      });

      // 3. Redirect on success
      navigate('/dashboard');
    } catch (err) {
      const errData = err.response?.data?.data;
      if (err.response?.status === 403 && errData?.code === 'DEVICE_MISMATCH') {
        // Device mismatch detected!
        setMismatchData(errData);
        setViewMode('mismatch');
      } else {
        setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceRequestSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmittingRequest(true);

    try {
      const fp = await getDeviceFingerprint();
      const info = await getDeviceInfo();
      const deviceLabel = [info?.model, info?.os].filter(Boolean).join(' · ') || navigator.userAgent;
      const finalReason = requestReason === 'Other reason' && customReason.trim()
        ? `Other: ${customReason.trim()}`
        : requestReason;

      const res = await api.post('/auth/device-access-request', {
        email: form.email,
        password: form.password,
        reason: finalReason,
        requestedDeviceLabel: deviceLabel,
        deviceFingerprint: fp,
      });

      const requestId = res.data?.data?.request?._id;
      setPendingReqId(requestId);
      setViewMode('pending');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit device access request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleApprovedSignIn = async () => {
    // Re-trigger standard login now that device is approved
    setViewMode('login');
    setTimeout(() => {
      const btn = document.getElementById('login-submit-btn');
      btn?.click();
    }, 100);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-slide-up">
        {/* Logo / Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-blue-600 rounded-2xl mb-3 shadow-lg shadow-primary-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Spheronix Attendance</h1>
          <p className="text-slate-400 mt-0.5 text-xs">Secure Employee & Attendance Portal</p>
        </div>

        {/* ── 1. STANDARD LOGIN FORM ── */}
        {viewMode === 'login' && (
          <div className="card-glass border border-slate-600/50 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-danger-400 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="label">Email Address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@spheronixtechnology.in"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="input pr-12"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="login-submit-btn"
                disabled={loading}
                className="btn-primary btn-lg w-full mt-2 shadow-lg shadow-primary-500/25"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    <LogIn size={18} /> Sign In
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-slate-700/40">
                <p className="text-[11px] text-slate-400 mb-1.5">Test Employee Account (Click to fill):</p>
                <button
                  type="button"
                  id="fill-demo-credentials-btn"
                  onClick={() => setForm({ email: 'employee@spheronixtechnology.in', password: 'Employee@1234' })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-[11px] transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  employee@spheronixtechnology.in
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── 2. DEVICE MISMATCH / REQUEST ACCESS FORM ── */}
        {viewMode === 'mismatch' && (
          <div className="card-glass border border-amber-500/40 shadow-2xl animate-in fade-in">
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Device Not Authorized</h3>
                <p className="text-[11px] text-amber-300">Your account is bound to another phone</p>
              </div>
            </div>

            {/* Device Details Box */}
            <div className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-3.5 space-y-2 mb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Registered Phone:</span>
                <span className="font-semibold text-emerald-400">
                  {mismatchData?.registeredDeviceLabel || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">Current Phone:</span>
                <span className="font-semibold text-amber-400">
                  {mismatchData?.currentDeviceLabel || 'This device'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Attendance accounts are locked to one registered mobile phone. If you switched to this phone, submit a replacement request for approval.
            </p>

            <form onSubmit={handleDeviceRequestSubmit} className="space-y-4">
              {error && (
                <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-3 py-2 text-danger-400 text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="label text-xs">Reason for New Device</label>
                <select
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="input text-xs py-2"
                >
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r} className="bg-slate-900 text-white">
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {requestReason === 'Other reason' && (
                <div>
                  <textarea
                    rows={2}
                    placeholder="Describe why you are using a new device…"
                    className="input text-xs py-2"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setViewMode('login');
                  }}
                  className="btn-ghost flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="btn-primary flex-2 text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-lg shadow-primary-500/20"
                >
                  {submittingRequest ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Request Replacement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── 3. REQUEST PENDING LIVE APPROVAL ── */}
        {viewMode === 'pending' && (
          <div className="card-glass border border-blue-500/40 shadow-2xl p-6 text-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 text-primary-400 flex items-center justify-center mx-auto mb-4 relative">
              <Smartphone size={32} />
              <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-primary-400 animate-ping" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">Request Pending Approval</h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Your device replacement request has been submitted to your manager and admin. This screen will automatically update as soon as it is approved.
            </p>

            {rejectionNote && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 mb-4">
                <AlertCircle size={16} className="inline mr-1 text-red-400" />
                Request Rejected: {rejectionNote}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setViewMode('login');
                }}
                className="btn-ghost text-xs py-2 text-slate-400 hover:text-white"
              >
                Back to Login
              </button>
            </div>
          </div>
        )}

        {/* ── 4. DEVICE APPROVED STATE ── */}
        {viewMode === 'approved' && (
          <div className="card-glass border border-emerald-500/40 shadow-2xl p-6 text-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle size={36} />
            </div>

            <h3 className="text-base font-bold text-white mb-1">Device Approved!</h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Your new device has been authorized by your manager. Your previous device has been revoked.
            </p>

            <button
              onClick={handleApprovedSignIn}
              className="btn-success btn-lg w-full shadow-lg shadow-emerald-500/20"
            >
              <LogIn size={18} /> Sign In Now
            </button>
          </div>
        )}

        <p className="text-center text-slate-500 text-xs mt-6">
          &copy; {new Date().getFullYear()} Spheronix Technology. All rights reserved.
        </p>
      </div>
    </div>
  );
}

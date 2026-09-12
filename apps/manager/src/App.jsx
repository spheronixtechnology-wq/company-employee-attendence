import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import ManagerLayout from './components/ManagerLayout';
import { ManagerDeviceRequestsPage } from './pages/ManagerRequestsPages';
import DashboardPage from './pages/DashboardPage';
import AttendanceMethodPage from './pages/AttendanceMethodPage';
import OfficeLocationsPage from './pages/OfficeLocationsPage';
import WifiSettingsPage from './pages/WifiSettingsPage';
import TeamOvertimePage from './pages/TeamOvertimePage';
import { Loader2, X, Clock, Coffee, Timer, FileText, AlertTriangle, ExternalLink, ChevronRight, ChevronLeft, Eye, Download, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from './lib/api';
import DocumentPreviewModal from './components/DocumentPreviewModal';
import EmployeeProfileModal from './components/EmployeeProfileModal';
import EmployeeCreationModal from './components/EmployeeCreationModal';
import UploadDailyLogModal from './components/UploadDailyLogModal';

// ── Login Page (shared design) ──────────────────────────────────────────────
import { EyeOff, LogIn, ShieldCheck, Shield, Copy, Check, ArrowLeft, KeyRound, QrCode } from 'lucide-react';

const LoginPage = () => {
  const { login, verifyMfaSetup, verifyMfa } = useAuth();
  const navigate = useNavigate();

  // Navigation steps: 'credentials' | 'mfa_setup' | 'mfa_verify'
  const [step, setStep] = useState('credentials');
  const [form, setForm] = useState({ email: '', password: '' });
  const [mfaData, setMfaData] = useState({ tempToken: '', qrCode: '', secret: '' });
  const [otp, setOtp] = useState('');
  const [copied, setCopied] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Submit Credentials
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data?.mfaRequired) {
        if (!data.mfaEnrolled) {
          // First-time enrollment or after Admin reset: show QR code
          setMfaData({
            tempToken: data.tempToken,
            qrCode: data.qrCode,
            secret: data.secret,
          });
          setOtp('');
          setStep('mfa_setup');
        } else {
          // Normal subsequent login: strictly prompt for OTP (NO QR code)
          setMfaData({
            tempToken: data.tempToken,
            qrCode: '',
            secret: '',
          });
          setOtp('');
          setStep('mfa_verify');
        }
      } else {
        // Direct session without MFA (non-manager or MFA disabled)
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Initial MFA Setup
  const handleMfaSetupSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter the full 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await verifyMfaSetup(mfaData.tempToken, otp);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid 6-digit code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify Subsequent MFA Login
  const handleMfaVerifySubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter the full 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await verifyMfa(mfaData.tempToken, otp);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid 6-digit code. Please check your authenticator app.');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    if (!mfaData.secret) return;
    navigator.clipboard.writeText(mfaData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setOtp('');
    setMfaData({ tempToken: '', qrCode: '', secret: '' });
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo / Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl mb-4 shadow-md shadow-violet-500/20">
            {step === 'credentials' && (
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            {step === 'mfa_setup' && <QrCode className="w-8 h-8 text-white" />}
            {step === 'mfa_verify' && <ShieldCheck className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Manager Portal</h1>
          <p className="text-slate-600 mt-1 text-xs">Spheronix Technology</p>
        </div>

        <div className="card bg-white border border-slate-200 shadow-xl p-6">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-700 text-xs mb-5 font-medium flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: EMAIL & PASSWORD ── */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label className="label text-xs font-semibold text-slate-700">Work Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="manager@spheronixtechnology.in"
                  className="input text-xs border-slate-200 bg-white text-slate-900"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <label className="label text-xs font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    className="input pr-12 text-xs border-slate-200 bg-white text-slate-900"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 transition-colors"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="login-submit-btn"
                disabled={loading}
                className="btn bg-violet-600 hover:bg-violet-500 text-white btn-lg w-full text-xs font-bold mt-2 shadow-md shadow-violet-600/20"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                {loading ? 'Verifying Credentials...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* ── STEP 2: MFA SETUP & ENROLLMENT (QR CODE SHOWN) ── */}
          {step === 'mfa_setup' && (
            <form onSubmit={handleMfaSetupSubmit} className="space-y-4 animate-fade-in">
              <div className="text-center pb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold uppercase tracking-wider">
                  Step 2: Authenticator Setup
                </span>
                <h2 className="text-base font-bold text-slate-900 mt-2">Scan QR with Authenticator</h2>
                <p className="text-slate-600 text-xs mt-1">
                  Use Google Authenticator, Microsoft Authenticator, or Authy on your mobile device.
                </p>
              </div>

              {/* QR Code Card */}
              {mfaData.qrCode && (
                <div className="flex flex-col items-center justify-center p-3.5 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
                  <div className="p-2.5 bg-white rounded-xl shadow-md">
                    <img
                      src={mfaData.qrCode}
                      alt="Authenticator QR Code"
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                  <span className="text-[11px] text-slate-600 mt-2 font-medium">
                    Point your camera at this code in your Authenticator app
                  </span>
                </div>
              )}

              {/* Manual Secret Key (if cannot scan) */}
              {mfaData.secret && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                    <span className="flex items-center gap-1 font-medium">
                      <KeyRound size={12} /> Can't scan? Enter key manually:
                    </span>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1 transition-colors"
                    >
                      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-slate-800 tracking-wider break-all select-all bg-white px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    {mfaData.secret.match(/.{1,4}/g)?.join(' ') || mfaData.secret}
                  </p>
                </div>
              )}

              {/* OTP Entry */}
              <div>
                <label className="label text-xs font-semibold text-slate-700 text-center block">
                  Enter 6-Digit Code from App
                </label>
                <input
                  id="mfa-setup-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl font-mono tracking-widest font-black py-2.5 border-violet-300 focus:border-violet-500 bg-white text-slate-900"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                id="mfa-setup-submit-btn"
                disabled={loading || otp.length !== 6}
                className="btn bg-violet-600 hover:bg-violet-500 text-white btn-lg w-full text-xs font-bold shadow-md shadow-violet-600/20 disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {loading ? 'Activating MFA...' : 'Verify & Complete Setup'}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  className="text-slate-600 hover:text-slate-900 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3: MFA VERIFICATION (SUBSEQUENT LOGINS — NO QR SHOWN) ── */}
          {step === 'mfa_verify' && (
            <form onSubmit={handleMfaVerifySubmit} className="space-y-4 animate-fade-in">
              <div className="text-center pb-2">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200 text-violet-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <ShieldCheck size={26} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Two-Factor Authentication</h2>
                <p className="text-slate-600 text-xs mt-1">
                  Open your Authenticator app and enter the 6-digit code for <strong>Spheronix</strong>.
                </p>
              </div>

              <div>
                <input
                  id="mfa-verify-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl font-mono tracking-widest font-black py-3 border-violet-300 focus:border-violet-500 bg-white text-slate-900"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                id="mfa-verify-submit-btn"
                disabled={loading || otp.length !== 6}
                className="btn bg-violet-600 hover:bg-violet-500 text-white btn-lg w-full text-xs font-bold shadow-md shadow-violet-600/20 disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {loading ? 'Verifying Code...' : 'Verify & Continue'}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  className="text-slate-600 hover:text-slate-900 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Team Members Page ─────────────────────────────────────────────────────────
const TeamMembersPage = () => {
  const [data, setData] = useState({ teams: [], members: [] });
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const { socket } = useSocket();

  const fetchMembers = useCallback(() => {
    setLoading(true);
    api.get('/manager/team/members')
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Real-time updates for team member status
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      api.get('/manager/team/members')
        .then(res => setData(res.data.data))
        .catch(console.error);
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-violet-400" size={32} /></div>;

  return (
    <div className="page-container space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Members</h1>
          <p className="text-slate-600 text-sm mt-0.5">
            {data.teams.map(t => t.name).join(', ') || 'Managed Teams'} · {data.members.length} member{data.members.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={() => setShowCreationModal(true)}
          className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors"
        >
          + Add Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.members.map(member => (
          <div
            key={member._id}
            onClick={() => setSelectedMemberId(member._id)}
            className="card relative overflow-hidden flex flex-col justify-between border-slate-200 hover:border-violet-300 hover:shadow-lg transition-all duration-200 cursor-pointer group hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3.5">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  className="w-11 h-11 rounded-xl object-cover flex-shrink-0 shadow-sm ring-1 ring-violet-200 group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                style={{ display: member.avatarUrl ? 'none' : 'flex' }}
              >
                {member.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-slate-900 font-bold truncate group-hover:text-violet-600 transition-colors">{member.name}</p>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    member.currentStatus === 'checked_in' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    member.currentStatus === 'on_break' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    member.currentStatus === 'checked_out' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {member.currentStatus === 'checked_in' ? '● Working' :
                     member.currentStatus === 'on_break' ? '☕ On Break' :
                     member.currentStatus === 'checked_out' ? '✓ Checked Out' : 'Offline'}
                  </span>
                </div>
                <p className="text-slate-600 text-xs mt-0.5 truncate">{member.designation || 'Employee'}</p>
                <p className="text-slate-500 text-xs truncate">{member.email}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>Team: {member.teamId?.name || 'Unassigned'}</span>
              <span className="text-violet-600 font-medium group-hover:underline flex items-center gap-1">
                View Profile & Records &rarr;
              </span>
            </div>
          </div>
        ))}
      </div>
      {data.members.length === 0 && (
        <div className="card text-center py-12 text-slate-500">
          No team members found in your assigned team(s).
        </div>
      )}

      {/* 360 Degree Performance & Profile Modal */}
      {selectedMemberId && (
        <EmployeeProfileModal
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
        />
      )}

      {showCreationModal && (
        <EmployeeCreationModal
          onClose={() => setShowCreationModal(false)}
          onSuccess={() => {
            setShowCreationModal(false);
            fetchMembers();
          }}
          teams={data.teams}
        />
      )}
    </div>
  );
};

// ── Team Attendance Page ───────────────────────────────────────────────────────
const TeamAttendancePage = () => {
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const { socket } = useSocket();

  const fetchAttendance = useCallback(() => {
    setLoading(true);
    api.get(`/manager/team/attendance?date=${date}`)
      .then(res => setRecords(res.data.data.attendance || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Real-time updates for attendance
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      api.get(`/manager/team/attendance?date=${date}`)
        .then(res => setRecords(res.data.data.attendance || []))
        .catch(console.error);
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    // Auto-refresh when an employee submits a manual attendance request
    socket.on('attendance:manual_request_created', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
      socket.off('attendance:manual_request_created', onUpdate);
    };
  }, [socket, date]);

  const handleManualDecision = async (requestId, action) => {
    let note = '';
    if (action === 'reject') {
      const input = prompt('Reason for rejection (optional):');
      if (input === null) return; // User clicked Cancel
      note = input;
    }

    setProcessingId(requestId + action);
    try {
      await api.post(`/manager/team/manual-attendance/${requestId}/decision`, {
        action,
        decisionNote: note || undefined,
      });
      fetchAttendance();
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} manual attendance request.`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="page-container space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Team Attendance</h1>
        <input type="date" className="input w-auto border-slate-200 bg-white text-slate-900 shadow-sm" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-600" size={28} /></div> : (
        <div className="space-y-3">
          {records.map(rec => {
            const isManualPending = rec.status === 'manual_pending' || (rec.manualRequest && rec.manualRequest.status === 'pending');
            const hasManualReq = Boolean(rec.manualRequest && rec.manualRequest._id);

            return (
              <div
                key={rec._id}
                className={`card transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 border-slate-200 shadow-sm ${
                  isManualPending
                    ? 'border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-300'
                    : ''
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-slate-900 font-bold text-sm">{rec.userId?.name}</p>
                    {isManualPending && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-semibold flex items-center gap-1">
                        <Clock size={12} /> Pending Manual Review
                      </span>
                    )}
                  </div>

                  {/* If employee submitted a manual attendance request, display their submitted reason */}
                  {rec.manualRequest?.reason && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900 max-w-xl">
                      <span className="font-semibold text-amber-800 block mb-0.5">Submitted Reason:</span>
                      <p className="italic text-slate-700">"{rec.manualRequest.reason}"</p>
                    </div>
                  )}

                  <p className="text-slate-600 text-xs">
                    {rec.checkInTime ? `In: ${new Date(rec.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Not checked in'}
                    {rec.checkOutTime ? ` · Out: ${new Date(rec.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Action buttons if pending manual review */}
                  {isManualPending && hasManualReq ? (
                    <div className="flex items-center gap-2">
                      <button
                        id={`approve-manual-${rec.manualRequest._id}`}
                        onClick={() => handleManualDecision(rec.manualRequest._id, 'approve')}
                        disabled={!!processingId}
                        className="py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {processingId === rec.manualRequest._id + 'approve' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        Approve
                      </button>

                      <button
                        id={`reject-manual-${rec.manualRequest._id}`}
                        onClick={() => handleManualDecision(rec.manualRequest._id, 'reject')}
                        disabled={!!processingId}
                        className="py-1.5 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {processingId === rec.manualRequest._id + 'reject' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {rec.totalWorkMinutes ? `${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m` : '—'}
                      </p>
                      <span
                        className={
                          rec.status === 'present'
                            ? 'badge-success'
                            : rec.status === 'half_day'
                            ? 'badge-warning'
                            : rec.status === 'absent'
                            ? 'badge-danger'
                            : rec.status === 'not_checked_in'
                            ? 'badge-gray'
                            : 'badge-gray'
                        }
                      >
                        {rec.status === 'not_checked_in' ? 'Not Checked In' : rec.status || 'pending'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {records.length === 0 && <p className="text-slate-500 text-center py-8">No attendance records for {date}.</p>}
        </div>
      )}
    </div>
  );
};

// ── Team Leave Requests Page ──────────────────────────────────────────────────
const TeamLeaveRequestsPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const { socket } = useSocket();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/team/leave-requests?status=${filter}`);
      setRequests(res.data.data.requests || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Real-time updates for leave requests
  useEffect(() => {
    if (!socket) return;
    const onNewLeave = () => fetchRequests();
    socket.on('leave:request_created', onNewLeave);
    return () => {
      socket.off('leave:request_created', onNewLeave);
    };
  }, [socket, fetchRequests]);

  const handleDecision = async (id, decision) => {
    const decisionNote = decision === 'rejected' ? prompt('Rejection reason:') : '';
    if (decision === 'rejected' && !decisionNote) return;
    try {
      await api.post(`/manager/team/leave/${id}/decision`, { decision, decisionNote });
      fetchRequests();
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="page-container space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900">Team Leave Requests</h1>
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn ${filter === s ? 'btn-primary' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'} text-xs capitalize shadow-sm`}>{s}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-600" size={28} /></div> : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req._id} className="card flex items-center justify-between gap-4 border-slate-200 shadow-sm">
              <div>
                <p className="text-slate-900 font-bold">{req.userId?.name}</p>
                <p className="text-slate-600 text-xs">{req.leaveTypeId?.name} · {req.startDate} → {req.endDate} ({req.totalDays}d)</p>
                <p className="text-slate-500 text-xs">{req.reason}</p>
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                  <button id={`mgr-approve-${req._id}`} onClick={() => handleDecision(req._id, 'approved')} className="btn-success text-xs px-3 py-1.5">Approve</button>
                  <button id={`mgr-reject-${req._id}`} onClick={() => handleDecision(req._id, 'rejected')} className="btn-danger text-xs px-3 py-1.5">Reject</button>
                </div>
              )}
              {req.status !== 'pending' && <span className={req.status === 'approved' ? 'badge-success' : 'badge-danger'}>{req.status}</span>}
            </div>
          ))}
          {requests.length === 0 && <p className="text-slate-500 text-center py-8">No {filter} leave requests.</p>}
        </div>
      )}
    </div>
  );
};

const formatDuration = (mins = 0) => {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const formatTime = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Detailed Modal for Employee Daily Log & Shift Report ─────────────────────
const EmployeeLogDetailModal = ({ log, onClose }) => {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  if (!log) return null;

  const user = log.userId || {};
  const att = log.attendance || null;
  const breaks = att?.breaks || [];
  const checkIn = att?.checkInTime;
  const checkOut = att?.checkOutTime;
  const totalDuration = att?.totalDurationMinutes ?? 0;
  const totalBreaks = att?.totalBreakMinutes ?? 0;
  const actualWork = att?.actualWorkMinutes ?? Math.max(0, totalDuration - totalBreaks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || 'Employee'}
                className="w-11 h-11 rounded-2xl object-cover shadow-md shadow-violet-500/20 ring-2 ring-violet-200"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center shadow-md shadow-violet-500/20"
              style={{ display: user.avatarUrl ? 'none' : 'flex' }}
            >
              {user.name?.[0]?.toUpperCase() || 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{user.name || 'Employee'}</h2>
                {att?.status && (
                  <span className={
                    att.status === 'present' ? 'badge-success' :
                    att.status === 'half_day' ? 'badge-warning' :
                    'badge-gray'
                  }>{att.status}</span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {user.designation || 'Team Member'} {user.email ? `· ${user.email}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Shift Metrics Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto mb-1">
                <Clock size={15} />
              </div>
              <p className="text-[11px] text-slate-600 font-medium">Gross Shift</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{totalDuration ? formatDuration(totalDuration) : `${log.hoursSpent}h`}</p>
              <p className="text-[10px] text-slate-500">Duration</p>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center mx-auto mb-1">
                <Coffee size={15} />
              </div>
              <p className="text-[11px] text-amber-800 font-medium">Total Breaks</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">{formatDuration(totalBreaks)}</p>
              <p className="text-[10px] text-amber-600">{breaks.length} break{breaks.length === 1 ? '' : 's'}</p>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center mx-auto mb-1">
                <Timer size={15} />
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">Actual Work</p>
              <p className="text-sm font-extrabold text-emerald-700 mt-0.5">{actualWork ? formatDuration(actualWork) : `${log.hoursSpent}h`}</p>
              <p className="text-[10px] text-emerald-600">Net Productive</p>
            </div>
          </div>

          {/* Timestamps */}
          {att && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Check-In Time:</span>
                <span className="font-semibold text-slate-900">{formatTime(checkIn)}</span>
              </div>
              <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1.5">
                <span>Check-Out Time:</span>
                <span className="font-semibold text-slate-900">{checkOut ? formatTime(checkOut) : 'Still Active'}</span>
              </div>
            </div>
          )}

          {/* Break Breakdown */}
          {breaks.length > 0 && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Coffee size={13} className="text-amber-600" /> Break Breakdown
                </span>
                <span className="text-xs font-mono text-slate-600">{formatDuration(totalBreaks)}</span>
              </div>
              <div className="space-y-1.5">
                {breaks.map((b, idx) => {
                  const bStart = b.startedAt ? new Date(b.startedAt) : null;
                  const bEnd = b.endedAt ? new Date(b.endedAt) : null;
                  const dur = (bStart && bEnd) ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 60000)) : 0;
                  const typeLabel = b.type ? (b.type.charAt(0).toUpperCase() + b.type.slice(1)) : 'Personal';
                  return (
                    <div key={b._id || idx} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs">
                      <span className="text-slate-800">
                        #{idx + 1} {typeLabel} Break ({formatTime(bStart)} – {formatTime(bEnd)})
                      </span>
                      <span className="font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {dur}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Work Log Content */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <FileText size={14} className="text-violet-600" /> Daily Work Summary
              </span>
              <span className="px-2.5 py-0.5 bg-violet-50 border border-violet-200 text-violet-700 font-bold rounded-full">
                Logged: {actualWork ? formatDuration(actualWork) : (log.hoursSpent ? `${log.hoursSpent}h` : '—')}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              {log.taskTitle && (
                <div>
                  <p className="text-[11px] text-slate-600 font-semibold mb-0.5">Task Title</p>
                  <p className="text-slate-900 font-medium bg-white p-2.5 rounded-lg border border-slate-200">{log.taskTitle}</p>
                </div>
              )}
              {log.projectName && (
                <div>
                  <p className="text-[11px] text-slate-600 font-semibold mb-0.5">Project Name</p>
                  <p className="text-slate-900 font-medium bg-white p-2.5 rounded-lg border border-slate-200">{log.projectName}</p>
                </div>
              )}
              {log.description && (
                <div>
                  <p className="text-[11px] text-slate-600 font-semibold mb-0.5">Description</p>
                  <p className="text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 whitespace-pre-line">{log.description}</p>
                </div>
              )}
              {log.blockers && (
                <div>
                  <p className="text-[11px] text-rose-600 font-semibold mb-0.5">Blockers</p>
                  <p className="text-rose-800 bg-rose-50 p-2.5 rounded-lg border border-rose-200 whitespace-pre-line">{log.blockers}</p>
                </div>
              )}
              {log.githubLink && (
                <div>
                  <p className="text-[11px] text-slate-600 font-semibold mb-0.5">GitHub Repository / PR</p>
                  <a
                    href={log.githubLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-violet-600 hover:text-violet-700 font-mono flex items-center gap-1.5 underline bg-white p-2 rounded-lg border border-slate-200"
                  >
                    <ExternalLink size={12} /> {log.githubLink}
                  </a>
                </div>
              )}
            </div>

            {/* Document Submission Card */}
            {(log.documentUrl || log.attachmentUrl) && (
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-sm mb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      {(log.doctype || log.documentName || '').match(/\.(xlsx|xls|csv)$|^(xlsx|xls|csv)$/i) ? (
                        <FileSpreadsheet size={20} />
                      ) : (
                        <FileText size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-bold text-slate-900 truncate max-w-[240px]" title={log.documentName || 'Daily Work Document'}>
                          {log.documentName || log.taskTitle || 'Daily Work Document'}
                        </p>
                        {/* Doctype Badge */}
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          (log.doctype || log.documentName || '').match(/xlsx|xls|csv/i)
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : (log.doctype || log.documentName || '').match(/docx|doc/i)
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : (log.doctype || log.documentName || '').match(/pdf/i)
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-primary-50 border-primary-200 text-primary-700'
                        }`}>
                          {log.doctype || (log.documentName || '').split('.').pop() || 'DOC'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {log.documentSize ? `${(log.documentSize / (1024 * 1024)).toFixed(2)} MB • ` : ''}
                        {(log.documentUrl && log.documentUrl.startsWith('data:')) ? '64-base encoded link' : 'Uploaded document'} • Ready for preview & download
                      </p>
                    </div>
                  </div>
                </div>

                {/* Two Action Buttons: Preview (View without download) and Download */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    id="preview-document-btn"
                    onClick={() => setShowPreviewModal(true)}
                    className="btn-primary text-xs py-2 px-3 flex items-center justify-center gap-1.5 font-semibold shadow-sm"
                  >
                    <Eye size={14} /> Preview Document
                  </button>

                  <button
                    type="button"
                    id="download-document-direct-btn"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = log.documentUrl || log.attachmentUrl;
                      link.download = log.documentName || `work-document.${log.doctype || 'dat'}`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="btn bg-white text-xs py-2 px-3 flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm"
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-200">
              <span>Log Date: {log.logDate}</span>
              <span>Submitted: {log.submittedAt ? formatTime(log.submittedAt) : 'Today'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
          <button onClick={onClose} className="btn bg-white text-xs py-2 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm">
            Close
          </button>
        </div>
      </div>

      {/* In-App Document Previewer Modal */}
      <DocumentPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        documentUrl={log.documentUrl || log.attachmentUrl}
        documentName={log.documentName || log.taskTitle || 'Daily Work Document'}
        documentSize={log.documentSize}
      />
    </div>
  );
};

// ── Team Daily Logs Page ──────────────────────────────────────────────────────
const TeamDailyLogsPage = () => {
  const today = new Date();
  // Ensure we don't have timezone offset issues when rendering current month
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  const [logs, setLogs] = useState([]);
  const [totalTeamMembers, setTotalTeamMembers] = useState(0);
  const [teamMembers, setTeamMembers] = useState([]);
  const [missingMembers, setMissingMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [uploadLogData, setUploadLogData] = useState(null); // { user, isEdit, existingLog }
  const { socket } = useSocket();

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const startStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2, '0')}-01`;
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const endStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    api.get(`/manager/team/daily-logs?startDate=${startStr}&endDate=${endStr}`)
      .then(res => {
        setLogs(res.data.data.logs || []);
        setTotalTeamMembers(res.data.data.totalTeamMembers || 0);
        setTeamMembers(res.data.data.teamMembers || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentMonth]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!socket) return;
    const onLogSubmitted = () => fetchLogs();
    socket.on('daily_log:submitted', onLogSubmitted);
    socket.on('attendance:update', onLogSubmitted);
    return () => {
      socket.off('daily_log:submitted', onLogSubmitted);
      socket.off('attendance:update', onLogSubmitted);
    };
  }, [socket, fetchLogs]);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const blanks = Array.from({ length: firstDay });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const logsByDate = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      if (!map[log.logDate]) map[log.logDate] = [];
      map[log.logDate].push(log);
    });
    return map;
  }, [logs]);

  const selectedDateLogs = logsByDate[selectedDate] || [];

  // Compute missing members dynamically for the selected date
  useEffect(() => {
    const d = new Date(selectedDate);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend) {
      setMissingMembers([]);
      return;
    }
    
    const submittedIds = new Set(selectedDateLogs.map(l => l.userId?._id?.toString()).filter(Boolean));
    const missing = teamMembers.filter(m => {
      // Check joined date
      if (m.joinedDate && new Date(m.joinedDate) > d) return false;
      return !submittedIds.has(m._id.toString());
    });
    setMissingMembers(missing);
  }, [selectedDate, selectedDateLogs, teamMembers]);

  return (
    <div className="page-container space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Daily Logs</h1>
          <p className="text-slate-600 text-sm mt-1">Select a date to view your team's submitted daily logs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Calendar Component */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="card border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-1">
                <button onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {blanks.map((_, i) => <div key={`blank-${i}`} className="p-2" />)}
              {days.map(day => {
                const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = selectedDate === dateStr;
                const isTodayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                const isToday = dateStr === isTodayStr;
                const dayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isFuture = new Date(dateStr) > today;
                
                const logCount = logsByDate[dateStr]?.length || 0;
                let dotColor = null;
                if (!isFuture) {
                  if (logCount >= totalTeamMembers && totalTeamMembers > 0) dotColor = 'bg-emerald-500';
                  else if (logCount > 0) dotColor = 'bg-amber-400';
                  else if (!isWeekend) dotColor = 'bg-rose-400'; 
                }

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative flex flex-col items-center justify-center aspect-square rounded-xl text-sm font-medium transition-all duration-200 hover:bg-violet-50 hover:text-violet-700
                      ${isSelected ? 'bg-violet-600 text-white shadow-md hover:bg-violet-600 hover:text-white' : 'text-slate-700 bg-slate-50/50'}
                      ${isToday && !isSelected ? 'ring-1 ring-violet-400 text-violet-700 font-bold' : ''}
                    `}
                  >
                    <span>{day}</span>
                    {dotColor && (
                      <span className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/90' : dotColor}`}></span>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> All Logs</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Partial</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400"></span> Missing</div>
            </div>
          </div>
        </div>

        {/* Right: Selected Date Detailed Table */}
        <div className="lg:col-span-7">
          <div className="card border-slate-200 shadow-sm p-0 overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-slate-800">
                  Daily Logs — {new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedDateLogs.length} logs submitted</p>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-violet-600" size={24} /></div>
              ) : selectedDateLogs.length === 0 && missingMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <FileText className="text-slate-400" size={24} />
                  </div>
                  <p className="text-slate-600 font-medium">No logs expected or submitted</p>
                  <p className="text-slate-400 text-sm mt-1">There are no daily logs available or missing for this date.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Check-In</th>
                      <th className="px-5 py-3">Check-Out</th>
                      <th className="px-5 py-3">Work Hours</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedDateLogs.map(log => {
                      const att = log.attendance;
                      const checkIn = att?.checkInTime ? formatTime(att.checkInTime) : '—';
                      const checkOut = att?.checkOutTime ? formatTime(att.checkOutTime) : '—';
                      const hours = log.hoursSpent ? `${log.hoursSpent}h` : '—';
                      
                      return (
                        <tr key={log._id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {log.userId?.avatarUrl ? (
                                <img src={log.userId.avatarUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover shadow-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                              ) : null}
                              <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-xs shadow-sm" style={{ display: log.userId?.avatarUrl ? 'none' : 'flex' }}>
                                {log.userId?.name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{log.userId?.name}</p>
                                <p className="text-[11px] text-slate-500">{log.userId?.designation}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-medium">{checkIn}</td>
                          <td className="px-5 py-3.5 text-slate-600 font-medium">{checkOut}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                              {hours}
                            </span>
                            {(log.submissionType === 'manager' || log.isEdited) && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                {log.isEdited ? 'Edited by Manager' : 'Uploaded by Manager'}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2">
                            <button onClick={() => setUploadLogData({ user: log.userId, isEdit: true, existingLog: log })} className="text-slate-600 hover:text-violet-600 text-xs font-semibold px-2.5 py-1.5 rounded bg-slate-50 hover:bg-violet-50 transition-colors">
                              Edit
                            </button>
                            <button onClick={() => setSelectedLog(log)} className="text-violet-600 hover:text-violet-800 text-xs font-semibold px-2.5 py-1.5 rounded bg-violet-50 hover:bg-violet-100 transition-colors">
                              View Report
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Render Missing Members */}
                    {missingMembers.map(member => (
                      <tr key={member._id} className="bg-rose-50/40 hover:bg-rose-50/70 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover shadow-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                            ) : null}
                            <div className="w-8 h-8 rounded-full bg-rose-200 text-rose-800 font-bold flex items-center justify-center text-xs shadow-sm" style={{ display: member.avatarUrl ? 'none' : 'flex' }}>
                              {member.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{member.name}</p>
                              <p className="text-[11px] text-rose-600 font-medium">Missing Log</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 font-medium">—</td>
                        <td className="px-5 py-3.5 text-slate-400 font-medium">—</td>
                        <td className="px-5 py-3.5"><span className="text-rose-500 font-bold text-xs uppercase tracking-wider">Missing</span></td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => setUploadLogData({ user: member, isEdit: false, existingLog: null })} className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-3 py-1.5 rounded bg-rose-100 hover:bg-rose-200 transition-colors border border-rose-200">
                            + Add Log
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <EmployeeLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      
      {uploadLogData && (
        <UploadDailyLogModal
          targetUser={uploadLogData.user}
          initialDate={selectedDate}
          isEdit={uploadLogData.isEdit}
          existingLog={uploadLogData.existingLog}
          onClose={() => setUploadLogData(null)}
          onSuccess={() => {
            setUploadLogData(null);
            fetchLogs(); // refresh
          }}
        />
      )}
    </div>
  );
};

const PlaceholderPage = ({ title }) => (
  <div className="page-container"><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="text-slate-600 mt-2">This section is available when the required manager permission is enabled by Admin.</p></div>
);



const ProtectedRoute = ({ children }) => {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="animate-spin text-primary-600" size={40} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 space-y-4">
        <p className="p-6 text-rose-600 text-lg font-semibold">Access denied. Manager only.</p>
        <button onClick={logout} className="btn-primary">Log Out / Switch Account</button>
      </div>
    );
  }
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="animate-spin text-violet-600" size={40} /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <ManagerLayout>
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/team/members" element={<TeamMembersPage />} />
              <Route path="/team/attendance" element={<TeamAttendancePage />} />
              <Route path="/team/overtime" element={<TeamOvertimePage />} />
              <Route path="/team/daily-logs" element={<TeamDailyLogsPage />} />
              <Route path="/team/leave-requests" element={<TeamLeaveRequestsPage />} />
              <Route path="/device-requests" element={<ManagerDeviceRequestsPage />} />
              <Route path="/attendance-method" element={<AttendanceMethodPage />} />
              <Route path="/wifi-settings" element={<WifiSettingsPage />} />
              <Route path="/office-locations" element={<OfficeLocationsPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ManagerLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

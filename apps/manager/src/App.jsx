import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import ManagerLayout from './components/ManagerLayout';
import { ManagerDeviceRequestsPage } from './pages/ManagerRequestsPages';
import DashboardPage from './pages/DashboardPage';
import AttendanceMethodPage from './pages/AttendanceMethodPage';
import OfficeLocationsPage from './pages/OfficeLocationsPage';
import WifiSettingsPage from './pages/WifiSettingsPage';
import TeamOvertimePage from './pages/TeamOvertimePage';
import { Loader2, X, Clock, Coffee, Timer, FileText, AlertTriangle, ExternalLink, ChevronRight, ChevronLeft, Eye, Download, FileSpreadsheet, CheckCircle2, XCircle, Search, Filter, Users, ArrowRight, Sparkles, RefreshCw, Calendar as CalendarIcon, Plus, LogOut, UserCheck, UserX, MessageSquare, UserCircle2, Camera, Save, Phone, Mail, Briefcase, Shield, Edit3, Trash2 } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from './lib/api';
import DocumentPreviewModal from './components/DocumentPreviewModal';
import EmployeeProfileModal from './components/EmployeeProfileModal';
import EmployeeCreationModal from './components/EmployeeCreationModal';
import UploadDailyLogModal from './components/UploadDailyLogModal';

import { EyeOff, LogIn, ShieldCheck, Copy, Check, ArrowLeft, KeyRound, QrCode } from 'lucide-react';
import companyLogo from './images/company logo.png';

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
          <img src={companyLogo} alt="Spheronix" className="h-16 w-auto mx-auto mb-4 object-contain" />
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const openDelete = (member, e) => {
    if (e) e.stopPropagation();
    setMemberToDelete(member);
    setShowDeleteModal(true);
  };

  const handleDeleteMember = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/manager/team/members/${memberToDelete._id}`);
      setShowDeleteModal(false);
      setMemberToDelete(null);
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive team member.');
    } finally {
      setIsDeleting(false);
    }
  };

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
                    <button
                      onClick={(e) => openDelete(member, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Archive Member"
                    >
                      <Trash2 size={13} />
                    </button>
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

      {/* ── Confirmation Modal (Delete/Archive Member) ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-slide-up text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h2 className="text-lg font-black text-slate-900 mb-2">Archive Team Member?</h2>
            <p className="text-slate-500 text-xs mb-6">
              Are you sure you want to remove <strong>{memberToDelete?.name}</strong>? They will no longer appear in the team member list, but their attendance history will be preserved.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteModal(false)} 
                className="btn-ghost flex-1 py-2.5 rounded-xl text-slate-600 font-bold"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteMember} 
                disabled={isDeleting} 
                className="btn bg-rose-600 hover:bg-rose-700 text-white font-bold flex-1 py-2.5 rounded-xl shadow-xs flex justify-center items-center gap-2"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Team Attendance Page ───────────────────────────────────────────────────────
const TeamAttendancePage = () => {
  const [searchParams] = useSearchParams();
  const qDate = searchParams.get('date');
  const qFilter = searchParams.get('filter') || searchParams.get('status');

  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(() => qDate || new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    if (['present', 'attended'].includes(qFilter)) return 'present';
    if (['not_checked_in', 'absent'].includes(qFilter)) return 'not_checked_in';
    if (['manual_pending', 'pending', 'review'].includes(qFilter)) return 'manual_pending';
    return 'all';
  });
  const [processingId, setProcessingId] = useState(null);
  const { socket } = useSocket();

  useEffect(() => {
    const paramDate = searchParams.get('date');
    const paramFilter = searchParams.get('filter') || searchParams.get('status');
    if (paramDate && paramDate !== date) {
      setDate(paramDate);
    }
    if (paramFilter) {
      if (['present', 'attended'].includes(paramFilter)) setStatusFilter('present');
      else if (['not_checked_in', 'absent'].includes(paramFilter)) setStatusFilter('not_checked_in');
      else if (['manual_pending', 'pending', 'review'].includes(paramFilter)) setStatusFilter('manual_pending');
      else if (paramFilter === 'all') setStatusFilter('all');
    }
  }, [searchParams]);

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
    socket.on('attendance:manual_request_created', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
      socket.off('attendance:manual_request_created', onUpdate);
    };
  }, [socket, date]);

  const handleDateShift = (days) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
  };

  const handleJumpToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
  };

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const isToday = date === new Date().toISOString().split('T')[0];

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

  // Summary Metrics
  const totalCount = records.length;
  const presentCount = records.filter(r => r.status === 'present' || r.checkInTime).length;
  const notCheckedInCount = records.filter(r => (r.status === 'not_checked_in' || r.status === 'absent') && !r.checkInTime).length;
  const manualPendingCount = records.filter(r => r.status === 'manual_pending' || (r.manualRequest && r.manualRequest.status === 'pending')).length;

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const name = rec.userId?.name || '';
      const email = rec.userId?.email || '';
      const desig = rec.userId?.designation || '';
      const matchesSearch = !search.trim() || 
        `${name} ${email} ${desig}`.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      const isManual = rec.status === 'manual_pending' || (rec.manualRequest && rec.manualRequest.status === 'pending');
      const isPresent = rec.status === 'present' || rec.checkInTime;
      const isNotChecked = (rec.status === 'not_checked_in' || rec.status === 'absent') && !rec.checkInTime;

      if (statusFilter === 'present') return isPresent && !isManual;
      if (statusFilter === 'not_checked_in') return isNotChecked;
      if (statusFilter === 'manual_pending') return isManual;
      return true;
    });
  }, [records, search, statusFilter]);

  return (
    <div className="page-container space-y-6 animate-fade-in pb-12">
      {/* ── Page Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Team Attendance</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs">
              Live Roster
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Real-time shift presence, punch timestamps, and manual review authorizations
          </p>
        </div>

        {/* Date Navigator & Steppers */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-white border border-slate-200/90 rounded-2xl p-1 shadow-xs hover:border-slate-300 transition-all">
            <button
              type="button"
              onClick={() => handleDateShift(-1)}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="relative flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-800 cursor-pointer group hover:bg-slate-50 rounded-xl transition-colors">
              <CalendarIcon size={14} className="text-violet-600 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="tracking-tight">{formattedDate}</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Click to select specific date"
              />
            </div>

            <button
              type="button"
              onClick={() => handleDateShift(1)}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={handleJumpToday}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-xl ml-1 transition-all cursor-pointer shadow-2xs ${
                isToday
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200/80'
              }`}
            >
              Today
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAttendance}
            className="p-2 rounded-2xl bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── 3 Quick Summary KPI Ribbon ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">

        {/* Team Total */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`group relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === 'all'
              ? 'bg-gradient-to-br from-violet-600 to-indigo-700 border-violet-500 shadow-lg shadow-violet-500/25'
              : 'bg-white border-slate-200/80 hover:border-violet-200 hover:shadow-md shadow-[0_2px_12px_-3px_rgba(0,0,0,0.07)]'
          }`}
        >
          {/* background glow blob */}
          <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl transition-opacity ${statusFilter === 'all' ? 'bg-white/10 opacity-100' : 'bg-violet-400/10 opacity-60 group-hover:opacity-100'}`} />
          <div className="relative flex items-start justify-between gap-3">
            {/* Icon badge */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${statusFilter === 'all' ? 'bg-white/20' : 'bg-violet-50 border border-violet-100'}`}>
              <Users size={18} className={statusFilter === 'all' ? 'text-white' : 'text-violet-600'} />
            </div>
            {/* Label */}
            <span className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${statusFilter === 'all' ? 'text-violet-200' : 'text-slate-400'}`}>
              Team Total
            </span>
          </div>
          <div className="relative mt-3">
            <p className={`text-3xl font-black tracking-tight leading-none ${statusFilter === 'all' ? 'text-white' : 'text-slate-900'}`}>
              {totalCount}
            </p>
            <p className={`text-[11px] font-semibold mt-1.5 ${statusFilter === 'all' ? 'text-violet-200' : 'text-slate-500'}`}>
              Assigned Employees
            </p>
          </div>
        </div>

        {/* Checked In */}
        <div
          onClick={() => setStatusFilter('present')}
          className={`group relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === 'present'
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400 shadow-lg shadow-emerald-500/25'
              : 'bg-white border-slate-200/80 hover:border-emerald-200 hover:shadow-md shadow-[0_2px_12px_-3px_rgba(0,0,0,0.07)]'
          }`}
        >
          <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl transition-opacity ${statusFilter === 'present' ? 'bg-white/10 opacity-100' : 'bg-emerald-400/10 opacity-60 group-hover:opacity-100'}`} />
          <div className="relative flex items-start justify-between gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${statusFilter === 'present' ? 'bg-white/20' : 'bg-emerald-50 border border-emerald-100'}`}>
              <UserCheck size={18} className={statusFilter === 'present' ? 'text-white' : 'text-emerald-600'} />
            </div>
            <span className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${statusFilter === 'present' ? 'text-emerald-100' : 'text-slate-400'}`}>
              On Duty
            </span>
          </div>
          <div className="relative mt-3">
            <p className={`text-3xl font-black tracking-tight leading-none ${statusFilter === 'present' ? 'text-white' : 'text-emerald-600'}`}>
              {presentCount}
            </p>
            <p className={`text-[11px] font-semibold mt-1.5 ${statusFilter === 'present' ? 'text-emerald-100' : 'text-slate-500'}`}>
              {totalCount > 0 ? `${Math.round((presentCount / totalCount) * 100)}% attendance rate` : 'Checked In Today'}
            </p>
          </div>
        </div>

        {/* Not Checked In */}
        <div
          onClick={() => setStatusFilter('not_checked_in')}
          className={`group relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === 'not_checked_in'
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400 shadow-lg shadow-rose-500/25'
              : 'bg-white border-slate-200/80 hover:border-rose-200 hover:shadow-md shadow-[0_2px_12px_-3px_rgba(0,0,0,0.07)]'
          }`}
        >
          <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl transition-opacity ${statusFilter === 'not_checked_in' ? 'bg-white/10 opacity-100' : 'bg-rose-400/10 opacity-60 group-hover:opacity-100'}`} />
          <div className="relative flex items-start justify-between gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${statusFilter === 'not_checked_in' ? 'bg-white/20' : 'bg-rose-50 border border-rose-100'}`}>
              <UserX size={18} className={statusFilter === 'not_checked_in' ? 'text-white' : 'text-rose-600'} />
            </div>
            <span className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${statusFilter === 'not_checked_in' ? 'text-rose-100' : 'text-slate-400'}`}>
              Unmarked
            </span>
          </div>
          <div className="relative mt-3">
            <p className={`text-3xl font-black tracking-tight leading-none ${statusFilter === 'not_checked_in' ? 'text-white' : 'text-rose-600'}`}>
              {notCheckedInCount}
            </p>
            <p className={`text-[11px] font-semibold mt-1.5 ${statusFilter === 'not_checked_in' ? 'text-rose-100' : 'text-slate-500'}`}>
              Absent or Pending
            </p>
          </div>
        </div>

      </div>



      {/* ── Search & Filter Controls Bar ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/95 backdrop-blur-xl p-3 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)]">
        {/* Search Input */}
        <div className="relative w-full sm:w-80 flex-shrink-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or designation..."
            className="w-full text-xs font-medium pl-9.5 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.08)] transition-all outline-none text-slate-800 placeholder-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'all', label: 'All', count: totalCount, color: 'violet' },
            { id: 'present', label: 'Checked In', count: presentCount, color: 'emerald' },
            { id: 'not_checked_in', label: 'Not Checked In', count: notCheckedInCount, color: 'rose' },
          ].map(tab => {
            const active = statusFilter === tab.id;
            const colorMap = {
              violet: {
                active: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 ring-1 ring-violet-400/30',
                inactive: 'text-slate-600 hover:text-violet-700 hover:bg-violet-50/80',
                badge: active ? 'bg-white/25 text-white' : 'bg-violet-100 text-violet-700',
              },
              emerald: {
                active: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400/30',
                inactive: 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/80',
                badge: active ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700',
              },
              rose: {
                active: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-500/25 ring-1 ring-rose-400/30',
                inactive: 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/80',
                badge: active ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-700',
              },
            };
            const c = colorMap[tab.color];
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer flex-shrink-0 ${
                  active ? c.active : c.inactive
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${c.badge}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>


      {/* ── Employee Attendance Grid Layout ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/80 rounded-3xl border border-slate-200/80 shadow-2xs">
          <Loader2 className="animate-spin text-violet-600 mb-3" size={32} />
          <p className="text-xs font-bold text-slate-600">Loading attendance roster for {formattedDate}...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="p-12 text-center bg-white/95 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Users size={24} />
          </div>
          <h3 className="text-sm font-extrabold text-slate-900">No employees match your criteria</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search
              ? `No employee records found matching "${search}".`
              : `No employees currently in the "${statusFilter.replace('_', ' ')}" category for this date.`}
          </p>
          {(search || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="mt-2 px-3.5 py-1.5 text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200/80 transition-all cursor-pointer shadow-2xs"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {filteredRecords.map(rec => {
            const isManualPending = rec.status === 'manual_pending' || (rec.manualRequest && rec.manualRequest.status === 'pending');
            const hasManualReq = Boolean(rec.manualRequest && rec.manualRequest._id);
            const isPresent = rec.status === 'present' || rec.checkInTime;

            const workMins = rec.totalWorkMinutes || rec.actualWorkMinutes || 0;
            const workHoursDisplay = workMins > 0
              ? `${Math.floor(workMins / 60)}h ${workMins % 60}m`
              : isPresent && !rec.checkOutTime
              ? 'Running...'
              : '—';

            return (
              <div
                key={rec._id}
                className={`group relative bg-white/95 backdrop-blur-md rounded-2xl border transition-all duration-200 hover:-translate-y-1 p-5 flex flex-col justify-between shadow-[0_2px_10px_-2px_rgba(0,0,0,0.03)] ${
                  isManualPending
                    ? 'border-amber-300 ring-2 ring-amber-400/20 shadow-md shadow-amber-500/10 bg-gradient-to-b from-amber-50/25 to-white'
                    : isPresent
                    ? 'border-slate-200/90 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10'
                    : 'border-slate-200/80 hover:border-slate-300 opacity-95 hover:opacity-100'
                }`}
              >
                {/* ── Top Employee Profile Section ── */}
                <div>
                  <div className="flex items-start justify-between gap-2.5 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar with Halo & Status Dot */}
                      <div className="relative shrink-0">
                        {rec.userId?.avatarUrl ? (
                          <img
                            src={rec.userId.avatarUrl}
                            alt={rec.userId?.name}
                            className="w-11 h-11 rounded-2xl object-cover ring-2 ring-slate-100 shadow-xs"
                          />
                        ) : (
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs ${
                            isManualPending
                              ? 'bg-gradient-to-tr from-amber-500 to-orange-500'
                              : isPresent
                              ? 'bg-gradient-to-tr from-emerald-500 to-teal-600'
                              : 'bg-gradient-to-tr from-slate-400 to-slate-500'
                          }`}>
                            {rec.userId?.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        {/* Live Online / Presence Indicator */}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          isManualPending
                            ? 'bg-amber-500 animate-pulse'
                            : isPresent
                            ? 'bg-emerald-500 ring-1 ring-emerald-500/30'
                            : 'bg-slate-300'
                        }`} />
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
                          {rec.userId?.name || 'Employee'}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-500 truncate">
                          {rec.userId?.designation || 'Team Member'}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge Pill */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border shadow-2xs ${
                      isManualPending
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : rec.status === 'present'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : rec.status === 'half_day'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {isManualPending ? 'Review' : rec.status === 'not_checked_in' ? 'Not In' : rec.status}
                    </span>
                  </div>

                  {/* ── Timings & Shift Metric Box ── */}
                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 space-y-2 mb-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <LogIn size={13} className="text-emerald-600 shrink-0" />
                        <span>Check-In</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {rec.checkInTime ? formatTime(rec.checkInTime) : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200/50 pt-1.5">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <LogOut size={13} className="text-indigo-600 shrink-0" />
                        <span>Check-Out</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {rec.checkOutTime ? formatTime(rec.checkOutTime) : rec.checkInTime ? 'Still Active' : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200/50 pt-1.5">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Clock size={13} className="text-violet-600 shrink-0" />
                        <span>Duration</span>
                      </span>
                      <span className={`font-mono font-black ${isPresent ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {workHoursDisplay}
                      </span>
                    </div>
                  </div>

                  {/* Manual Request Note (if applicable) */}
                  {isManualPending && rec.manualRequest?.reason && (
                    <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 mb-3">
                      <p className="font-bold text-[10px] text-amber-800 uppercase tracking-wider mb-0.5">Submitted Reason:</p>
                      <p className="italic text-slate-700 text-[11px] line-clamp-2">"{rec.manualRequest.reason}"</p>
                    </div>
                  )}
                </div>

                {/* ── Card Action / Footer ── */}
                {isManualPending && hasManualReq ? (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200/60">
                    <button
                      id={`approve-manual-${rec.manualRequest._id}`}
                      onClick={() => handleManualDecision(rec.manualRequest._id, 'approve')}
                      disabled={!!processingId}
                      className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
                      className="w-full py-2 px-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span className="uppercase font-bold tracking-wider text-slate-500">
                      {rec.checkInMethod ? rec.checkInMethod.replace('_', ' ') : 'Standard'}
                    </span>
                    <span className={rec.dailyLogSubmitted ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                      {rec.dailyLogSubmitted ? 'Log Filed ✅' : 'No Daily Log'}
                    </span>
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

// ── Team Leave Requests Page ──────────────────────────────────────────────────
const TeamLeaveRequestsPage = () => {
  const [searchParams] = useSearchParams();
  const qStatus = searchParams.get('status') || searchParams.get('filter');

  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => (['pending', 'approved', 'rejected', 'all'].includes(qStatus) ? qStatus : 'pending'));
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, requestId: null, reason: '' });
  const { socket } = useSocket();

  // Leave Quotas State
  const [leaveQuotas, setLeaveQuotas] = useState({ SL: 0, CL: 0, EL: 0, UL: 0 });
  const [quotasLoading, setQuotasLoading] = useState(false);
  const [quotaSuccessMsg, setQuotaSuccessMsg] = useState('');
  useEffect(() => {
    const paramStatus = searchParams.get('status') || searchParams.get('filter');
    if (paramStatus && ['pending', 'approved', 'rejected', 'all'].includes(paramStatus)) {
      setFilter(paramStatus);
    }
  }, [searchParams]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/manager/team/leave-requests?status=${filter}`);
      const data = res.data?.data;
      setRequests(data?.requests || []);
      if (data?.counts) setCounts(data.counts);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Failed to load leave requests.' });
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    api.get('/manager/team/primary/leave-quotas')
      .then(res => {
        if (res.data.data?.quotas) {
          setLeaveQuotas(res.data.data.quotas);
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveQuotas = async (e) => {
    e.preventDefault();
    setQuotasLoading(true);
    setQuotaSuccessMsg('');
    try {
      await api.put('/manager/team/primary/leave-quotas', leaveQuotas);
      setQuotaSuccessMsg('Team leave quotas saved successfully!');
      setTimeout(() => setQuotaSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setActionMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save quotas' });
    } finally {
      setQuotasLoading(false);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onLeave = () => fetchRequests();
    socket.on('leave:request_created', onLeave);
    socket.on('leave:request_resolved', onLeave);
    return () => {
      socket.off('leave:request_created', onLeave);
      socket.off('leave:request_resolved', onLeave);
    };
  }, [socket, fetchRequests]);

  const handleDecision = async (id, decision, decisionNote = '') => {
    setProcessingId(id + decision);
    try {
      await api.post(`/manager/team/leave/${id}/decision`, { decision, decisionNote: decisionNote || undefined });
      setActionMessage({ type: 'success', text: `Leave request ${decision === 'approved' ? 'approved ✅' : 'rejected ❌'}.` });
      fetchRequests();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || `Failed to ${decision} leave request.` });
    } finally {
      setProcessingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const openRejectModal = (requestId) => setRejectModal({ open: true, requestId, reason: '' });

  const confirmReject = async () => {
    if (!rejectModal.requestId) return;
    const { requestId, reason } = rejectModal;
    setRejectModal({ open: false, requestId: null, reason: '' });
    await handleDecision(requestId, 'rejected', reason);
  };

  const filteredRequests = requests.filter((req) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (req.userId?.name?.toLowerCase() || '').includes(q) ||
      (req.userId?.email?.toLowerCase() || '').includes(q) ||
      (req.leaveTypeId?.name?.toLowerCase() || '').includes(q) ||
      (req.reason?.toLowerCase() || '').includes(q)
    );
  });

  const totalInView = counts?.total ?? requests.length;
  const pendingCount = counts?.pending ?? 0;
  const approvedCount = counts?.approved ?? 0;
  const rejectedCount = counts?.rejected ?? 0;

  return (
    <div className="page-container space-y-6 animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary-500/25 flex-shrink-0">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Team Leave Requests</h1>
            <p className="text-slate-500 text-xs mt-0.5 font-medium">Review, approve, or reject leave applications from your team members.</p>
          </div>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all hover:scale-105 active:scale-95 self-start md:self-auto"
          title="Refresh requests"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-primary-600' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Action Notification ── */}
      {actionMessage && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
          actionMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {actionMessage.text}
        </div>
      )}

      {/* ── Premium Team Leave Configuration ── */}
      <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-2xl p-6 border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/10 to-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
        <form onSubmit={handleSaveQuotas} className="relative z-10 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sparkles size={18} className="text-primary-500" /> Team Leave Allocation
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                Configure default annual leave limits for your team. This immediately applies the limits to all members without affecting their already used leaves.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={quotasLoading}
                className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white text-xs font-extrabold tracking-wide uppercase rounded-xl flex items-center justify-center min-w-[160px] transition-all transform hover:-translate-y-0.5 shadow-md shadow-primary-500/20 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
              >
                {quotasLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Check size={14} className="mr-2" />}
                {quotasLoading ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 pt-2">
            {[
              { id: 'SL', label: 'Sick Leave', color: 'rose' },
              { id: 'CL', label: 'Casual Leave', color: 'sky' },
              { id: 'EL', label: 'Earned Leave', color: 'emerald' },
              { id: 'UL', label: 'Unpaid Leave', color: 'slate' }
            ].map((leave) => (
              <div key={leave.id} className="relative group/input">
                <div className={`absolute inset-0 bg-${leave.color}-500/5 rounded-xl transition-colors group-hover/input:bg-${leave.color}-500/10`}></div>
                <div className="relative p-3.5 border border-slate-200/80 rounded-xl bg-white/60 backdrop-blur-sm transition-all hover:border-slate-300 shadow-sm">
                  <label className="flex flex-col gap-1.5 cursor-text">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{leave.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full bg-${leave.color}-500 shadow-sm shadow-${leave.color}-500/40`}></span>
                      <input
                        type="number"
                        min="0"
                        value={leaveQuotas[leave.id] || 0}
                        onChange={(e) => setLeaveQuotas(prev => ({ ...prev, [leave.id]: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0 focus:outline-none placeholder-slate-300"
                        placeholder="0"
                      />
                      <span className="text-xs font-semibold text-slate-400">days</span>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>
          {quotaSuccessMsg && (
            <div className="absolute -top-12 right-0 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-200 shadow-lg shadow-emerald-500/10 flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300 z-50">
              <CheckCircle2 size={16} />
              {quotaSuccessMsg}
            </div>
          )}
        </form>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Total */}
        <div
          onClick={() => setFilter('all')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm rounded-2xl flex items-center gap-3 ${
            filter === 'all'
              ? 'border-slate-400 bg-slate-100 ring-1 ring-slate-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-slate-900">{totalInView}</p>
            <p className="text-[11px] text-slate-600 font-medium">Total In View</p>
          </div>
        </div>

        {/* Pending */}
        <div
          onClick={() => setFilter('pending')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm rounded-2xl flex items-center gap-3 ${
            filter === 'pending'
              ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-amber-700">{pendingCount}</p>
            <p className="text-[11px] text-slate-600 font-medium">Pending Review</p>
          </div>
        </div>

        {/* Approved */}
        <div
          onClick={() => setFilter('approved')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm rounded-2xl flex items-center gap-3 ${
            filter === 'approved'
              ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-emerald-700">{approvedCount}</p>
            <p className="text-[11px] text-slate-600 font-medium">Approved</p>
          </div>
        </div>

        {/* Rejected */}
        <div
          onClick={() => setFilter('rejected')}
          className={`card p-4 border cursor-pointer transition-all shadow-sm rounded-2xl flex items-center gap-3 ${
            filter === 'rejected'
              ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-300'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
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

      {/* ── Filter Tabs + Search ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                id={`mgr-tab-leave-${tab.key}`}
                onClick={() => setFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${
                    active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
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

      {/* ── Leave Request Cards ── */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-600 border-slate-200 shadow-sm rounded-2xl">
          <Loader2 className="animate-spin text-primary-600 mb-3" size={32} />
          <p className="text-xs font-semibold">Loading leave requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card text-center py-16 border-dashed border-slate-200 bg-white shadow-sm rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <CalendarIcon size={24} />
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
                className={`card transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 shadow-sm border rounded-2xl ${
                  isPending
                    ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {/* ── Left: Employee & Details ── */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                    {userInitials}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Name + designation + team */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-slate-900 font-bold text-sm truncate">{req.userId?.name || 'Unknown Employee'}</p>
                      {req.userId?.designation && (
                        <span className="text-[11px] text-slate-500 font-medium">• {req.userId.designation}</span>
                      )}
                      {req.userId?.teamId?.name && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold">
                          {req.userId.teamId.name}
                        </span>
                      )}
                    </div>

                    {/* Leave type + dates + applied date */}
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

                    {/* Reason Box */}
                    {req.reason && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 max-w-2xl mt-1">
                        <span className="text-slate-500 font-semibold block text-[11px] mb-0.5">Reason:</span>
                        <p className="italic text-slate-700 leading-relaxed">"{req.reason}"</p>
                      </div>
                    )}

                    {/* Decision note */}
                    {req.decisionNote && (
                      <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5">
                        <MessageSquare size={12} className="text-slate-400" />
                        <span>Note: <strong className="text-slate-800">{req.decisionNote}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Right: Actions or Status ── */}
                <div className="flex items-center gap-2.5 flex-shrink-0 self-end lg:self-center">
                  {isPending ? (
                    <div className="flex items-center gap-2">
                      <button
                        id={`mgr-approve-${req._id}`}
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
                        id={`mgr-reject-${req._id}`}
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

      {/* ── Reject Modal ── */}
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
                id="mgr-confirm-reject-btn"
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
  if (typeof dateInput === 'string' && /^\d{1,2}:\d{2}$/.test(dateInput)) {
    const [h, m] = dateInput.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Detailed Modal for Employee Daily Log & Shift Report ─────────────────────
const EmployeeLogDetailModal = ({ log, onClose }) => {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  if (!log) return null;

  const user = log.userId || {};
  const att = log.attendance || null;
  const breaks = att?.breaks || [];
  const checkIn = att?.checkInTime || log.checkInTime || null;
  const checkOut = att?.checkOutTime || log.checkOutTime || null;
  const totalDuration = att?.totalDurationMinutes ?? 0;
  const totalBreaks = att?.totalBreakMinutes ?? 0;
  const actualWork = att?.actualWorkMinutes ?? Math.max(0, totalDuration - totalBreaks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Modal Container: capped to max-h-[85vh] for perfect screen fit on any display */}
      <div className="relative w-full max-w-2xl bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.9)] overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] animate-in zoom-in-95 duration-200">
        
        {/* Top Decorative Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 shrink-0" />

        {/* ── Sticky Header with Generous Spacing ── */}
        <div className="px-7 sm:px-8 pt-6 pb-5 border-b border-slate-100/90 bg-white/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || 'Employee'}
                className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-500/10 shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-extrabold text-base flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-500/10 shrink-0"
              style={{ display: user.avatarUrl ? 'none' : 'flex' }}
            >
              {user.name?.[0]?.toUpperCase() || 'E'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
                  {user.name || 'Employee'}
                </h2>
                {att?.status && (
                  <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border shadow-2xs ${
                    att.status === 'present'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : att.status === 'half_day'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    {att.status === 'present' ? 'Present' : att.status === 'half_day' ? 'Half Day' : att.status}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200/50 text-slate-800 font-bold text-[11px]">
                  {user.designation || 'Team Member'}
                </span>
                {user.email && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200/50 text-slate-600 font-medium text-[11px]">
                    {user.email}
                  </span>
                )}
                {log.logDate && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700 font-bold text-[11px]">
                    {log.logDate}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer flex items-center justify-center border border-slate-200/60 shadow-2xs hover:scale-105 active:scale-95 shrink-0"
            title="Close report"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Scrollable Body with generous padding ── */}
        <div className="px-7 sm:px-8 py-6 overflow-y-auto space-y-5.5 flex-1 custom-scrollbar">
          
          {/* Shift Metrics KPIs */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Gross Shift */}
            <div className="p-3.5 bg-gradient-to-br from-sky-50 to-indigo-50/50 rounded-2xl border border-sky-200/70 text-center shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center mx-auto mb-1.5 shadow-2xs">
                <Clock size={16} />
              </div>
              <p className="text-[11px] text-sky-800 font-bold">Gross Shift</p>
              <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                {totalDuration ? formatDuration(totalDuration) : (log.hoursSpent ? `${log.hoursSpent}h` : '—')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Total Logged</p>
            </div>

            {/* Total Breaks */}
            <div className="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border border-amber-200/70 text-center shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center mx-auto mb-1.5 shadow-2xs">
                <Coffee size={16} />
              </div>
              <p className="text-[11px] text-amber-900 font-bold">Total Breaks</p>
              <p className="text-sm sm:text-base font-black text-amber-700 mt-0.5">
                {formatDuration(totalBreaks)}
              </p>
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                {breaks.length} break{breaks.length === 1 ? '' : 's'}
              </p>
            </div>

            {/* Net Actual Work */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl border border-emerald-200/70 text-center shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center mx-auto mb-1.5 shadow-2xs">
                <Timer size={16} />
              </div>
              <p className="text-[11px] text-emerald-900 font-bold">Actual Work</p>
              <p className="text-sm sm:text-base font-black text-emerald-700 mt-0.5">
                {actualWork ? formatDuration(actualWork) : (log.hoursSpent ? `${log.hoursSpent}h` : '—')}
              </p>
              <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Net Productive</p>
            </div>
          </div>

          {/* Timestamps */}
          {(att || checkIn || checkOut) && (
            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                  <Clock size={13} className="text-emerald-600" /> Check-In Time:
                </span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {formatTime(checkIn)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 border-t border-slate-200/60 pt-2">
                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                  <Clock size={13} className="text-indigo-600" /> Check-Out Time:
                </span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {checkOut ? formatTime(checkOut) : 'Still Active'}
                </span>
              </div>
            </div>
          )}

          {/* Break Breakdown List (if any) */}
          {breaks.length > 0 && (
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Coffee size={14} className="text-amber-600" /> Break Timeline
                </span>
                <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded-full">
                  {formatDuration(totalBreaks)}
                </span>
              </div>
              <div className="space-y-1.5">
                {breaks.map((b, idx) => {
                  const bStart = b.startedAt ? new Date(b.startedAt) : null;
                  const bEnd = b.endedAt ? new Date(b.endedAt) : null;
                  const dur = (bStart && bEnd) ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 60000)) : 0;
                  const typeLabel = b.type ? (b.type.charAt(0).toUpperCase() + b.type.slice(1)) : 'Personal';
                  return (
                    <div key={b._id || idx} className="flex items-center justify-between p-2.5 bg-white border border-slate-200/80 rounded-xl text-xs shadow-2xs">
                      <span className="text-slate-800 font-medium">
                        #{idx + 1} {typeLabel} Break ({formatTime(bStart)} – {formatTime(bEnd)})
                      </span>
                      <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        {dur}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Work Log Content */}
          <div className="p-4.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <span className="font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <FileText size={15} className="text-indigo-600" /> Daily Work Summary
              </span>
              <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-full">
                Logged: {actualWork ? formatDuration(actualWork) : (log.hoursSpent ? `${log.hoursSpent}h` : '—')}
              </span>
            </div>

            <div className="space-y-2.5">
              {log.taskTitle && (
                <div>
                  <p className="text-[11px] text-slate-500 font-bold mb-1">Task Title</p>
                  <p className="text-slate-900 font-semibold bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    {log.taskTitle}
                  </p>
                </div>
              )}

              {log.projectName && (
                <div>
                  <p className="text-[11px] text-slate-500 font-bold mb-1">Project Name</p>
                  <p className="text-slate-900 font-semibold bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    {log.projectName}
                  </p>
                </div>
              )}

              {log.description && (
                <div>
                  <p className="text-[11px] text-slate-500 font-bold mb-1">Description</p>
                  <p className="text-slate-800 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs whitespace-pre-line leading-relaxed">
                    {log.description}
                  </p>
                </div>
              )}

              {log.blockers && (
                <div>
                  <p className="text-[11px] text-rose-600 font-bold mb-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Blockers / Issues
                  </p>
                  <p className="text-rose-900 bg-rose-50/90 p-3 rounded-xl border border-rose-200/80 whitespace-pre-line leading-relaxed">
                    {log.blockers}
                  </p>
                </div>
              )}

              {log.githubLink && (
                <div>
                  <p className="text-[11px] text-slate-500 font-bold mb-1">GitHub Repository / PR</p>
                  <a
                    href={log.githubLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-mono flex items-center gap-1.5 underline bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs"
                  >
                    <ExternalLink size={13} /> {log.githubLink}
                  </a>
                </div>
              )}
            </div>

            {/* Document Submission Card */}
            {(log.documentUrl || log.attachmentUrl) && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
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
                      <p className="text-[11px] text-slate-500">
                        {log.documentSize ? `${(log.documentSize / (1024 * 1024)).toFixed(2)} MB • ` : ''}
                        {(log.documentUrl && log.documentUrl.startsWith('data:')) ? 'Base64 encoded' : 'Uploaded document'} • Ready for preview
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
                    className="px-3.5 py-2 text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
                    className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-200/80">
              <span className="font-medium">Log Date: <strong className="text-slate-700">{log.logDate}</strong></span>
              <span className="font-medium">Submitted: <strong className="text-slate-700">{log.submittedAt ? formatTime(log.submittedAt) : 'Today'}</strong></span>
            </div>
          </div>
        </div>

        {/* ── Sticky Elevated Footer ── */}
        <div className="px-6 py-3.5 bg-slate-50/95 backdrop-blur-md border-t border-slate-100/90 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-400 font-medium">
            Daily log review for manager oversight
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
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

// ── Team Daily Logs Page (Premium 2-Column Edition) ───────────────────────────
const TeamDailyLogsPage = () => {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const [searchParams] = useSearchParams();
  const qDate = searchParams.get('date');
  const qFilter = searchParams.get('filter') || searchParams.get('status');

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (qDate && qDate.includes('-')) {
      const parts = qDate.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && !isNaN(m)) return new Date(y, m, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => qDate || todayStr);
  const [logs, setLogs] = useState([]);
  const [totalTeamMembers, setTotalTeamMembers] = useState(0);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [uploadLogData, setUploadLogData] = useState(null); // { user, isEdit, existingLog }
  const [statusFilter, setStatusFilter] = useState(() => {
    if (['missing', 'pending'].includes(qFilter)) return 'missing';
    if (['submitted', 'completed'].includes(qFilter)) return 'submitted';
    return 'all';
  });
  const [search, setSearch] = useState('');
  const { socket } = useSocket();

  useEffect(() => {
    const paramDate = searchParams.get('date');
    const paramFilter = searchParams.get('filter') || searchParams.get('status');
    if (paramDate && paramDate !== selectedDate) {
      setSelectedDate(paramDate);
    }
    if (paramFilter) {
      if (['missing', 'pending'].includes(paramFilter)) setStatusFilter('missing');
      else if (['submitted', 'completed'].includes(paramFilter)) setStatusFilter('submitted');
      else if (paramFilter === 'all') setStatusFilter('all');
    }
  }, [searchParams]);

  // Sync currentMonth when selectedDate changes across months
  useEffect(() => {
    if (selectedDate && selectedDate.includes('-')) {
      const parts = selectedDate.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        setCurrentMonth(prev => {
          if (prev.getFullYear() === y && prev.getMonth() === m) return prev;
          return new Date(y, m, 1);
        });
      }
    }
  }, [selectedDate]);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const startStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const endStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    api.get(`/manager/team/daily-logs?startDate=${startStr}&endDate=${endStr}`)
      .then(res => {
        setLogs(res.data?.data?.logs || []);
        setTotalTeamMembers(res.data?.data?.totalTeamMembers || 0);
        setTeamMembers(res.data?.data?.teamMembers || []);
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

  const handleDateShift = (days) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${dayNum}`);
  };

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleJumpToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
  };

  const logsByDate = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      if (!map[log.logDate]) map[log.logDate] = [];
      map[log.logDate].push(log);
    });
    return map;
  }, [logs]);

  const selectedDateLogs = useMemo(() => {
    return logsByDate[selectedDate] || [];
  }, [logsByDate, selectedDate]);

  // Compute missing members dynamically for the selected date (useMemo prevents infinite re-render loop)
  const missingMembers = useMemo(() => {
    if (!selectedDate) return [];
    const d = new Date(`${selectedDate}T00:00:00`);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend) return [];

    const submittedIds = new Set(
      selectedDateLogs
        .map(l => (l.userId?._id || l.userId)?.toString())
        .filter(Boolean)
    );
    return teamMembers.filter(m => {
      if (m.joinedDate && new Date(m.joinedDate) > d) return false;
      return !submittedIds.has(m._id?.toString());
    });
  }, [selectedDate, selectedDateLogs, teamMembers]);

  // Calendar Day Generation (Monday start: Mo, Tu, We, Th, Fr, Sa, Su)
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Monday as 0: (getDay() + 6) % 7
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const daysList = [];

    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const pDay = prevMonthLastDay - i;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      daysList.push({
        dayNumber: pDay,
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(pDay).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      daysList.push({
        dayNumber: d,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: true,
      });
    }

    // Next month padding to 35 or 42 slots
    const totalSlots = daysList.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - daysList.length;
    for (let n = 1; n <= remainingSlots; n++) {
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      daysList.push({
        dayNumber: n,
        dateStr: `${nextY}-${String(nextM).padStart(2, '0')}-${String(n).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    return daysList;
  }, [currentMonth]);

  const weekHeaders = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // Formatted date string for selected date
  const formattedDate = useMemo(() => {
    if (!selectedDate) return '';
    const d = new Date(`${selectedDate}T00:00:00`);
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedDate]);

  // Counts & Metrics
  const submittedCount = selectedDateLogs.length;
  const missingCount = missingMembers.length;
  const totalRosterCount = teamMembers.length || totalTeamMembers;
  const totalExpected = submittedCount + missingCount;
  const submissionPct = totalExpected > 0 ? Math.round((submittedCount / totalExpected) * 100) : (totalRosterCount > 0 ? Math.round((submittedCount / totalRosterCount) * 100) : 0);

  // Filtered lists for the right side
  const filteredSubmittedLogs = useMemo(() => {
    if (!search.trim()) return selectedDateLogs;
    const q = search.toLowerCase();
    return selectedDateLogs.filter(l => {
      const name = l.userId?.name?.toLowerCase() || '';
      const email = l.userId?.email?.toLowerCase() || '';
      const designation = l.userId?.designation?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || designation.includes(q);
    });
  }, [selectedDateLogs, search]);

  const filteredMissingMembers = useMemo(() => {
    if (!search.trim()) return missingMembers;
    const q = search.toLowerCase();
    return missingMembers.filter(m => {
      const name = m.name?.toLowerCase() || '';
      const email = m.email?.toLowerCase() || '';
      const designation = m.designation?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || designation.includes(q);
    });
  }, [missingMembers, search]);

  const totalVisibleCount = (statusFilter === 'missing' ? 0 : filteredSubmittedLogs.length) + (statusFilter === 'submitted' ? 0 : filteredMissingMembers.length);

  return (
    <div className="page-container space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary-500/25 flex-shrink-0">
            <FileText size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Team Daily Logs
            </h1>
            <p className="text-slate-500 text-xs mt-0.5 font-medium">
              Review daily work logs, submitted tasks, hours tracked, and missing logs for your team.
            </p>
          </div>
        </div>

        {/* Date Stepper / Jump to Today */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-200/80 p-1.5 rounded-2xl shadow-sm self-start md:self-auto hover:border-slate-300 transition-all">
          <button
            type="button"
            onClick={() => handleDateShift(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Previous day"
          >
            <ArrowLeft size={16} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-slate-900 text-xs font-bold px-2 py-1 outline-none border-none cursor-pointer tracking-wide"
          />
          <button
            type="button"
            onClick={() => handleDateShift(1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Next day"
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={handleJumpToday}
            className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:opacity-95 transition-all hover:scale-105 active:scale-95 shadow-sm shadow-primary-500/20 ml-1 cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>

      {/* 2-Column Grid Layout: Left Sticky Calendar | Right Scrollable Daily Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Month Calendar & Day Turnout Summary Widget  */}
        {/* (Sticky on desktop so it stays pinned while right scrolls)*/}
        {/* ========================================================= */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          {/* Interactive Month Calendar Card */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all space-y-3.5">
            {/* Header: Month/Year + Steppers */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-primary-500/25">
                  <CalendarIcon size={16} />
                </div>
                <span className="font-extrabold text-slate-900 text-sm tracking-tight">
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleJumpToday}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                  title="Go to Today"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-slate-200 cursor-pointer"
                  title="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-slate-200 cursor-pointer"
                  title="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekday Row */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekHeaders.map((h, i) => (
                <div
                  key={h}
                  className={`text-[11px] font-bold py-1 select-none ${
                    i >= 5 ? 'text-amber-500' : 'text-slate-400'
                  }`}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((item) => {
                const isSelected = item.dateStr === selectedDate;
                const isToday = item.dateStr === todayStr;
                const dObj = new Date(item.dateStr);
                const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
                const isFuture = dObj > today;

                const logCount = logsByDate[item.dateStr]?.length || 0;
                let dotColorClass = null;
                if (!isFuture) {
                  if (logCount >= totalRosterCount && totalRosterCount > 0) {
                    dotColorClass = 'bg-emerald-500 ring-1 ring-white shadow-[0_0_6px_rgba(16,185,129,0.8)]';
                  } else if (logCount > 0) {
                    dotColorClass = 'bg-amber-400 ring-1 ring-white shadow-[0_0_6px_rgba(251,191,36,0.8)]';
                  } else if (!isWeekend) {
                    dotColorClass = 'bg-rose-400 ring-1 ring-white shadow-[0_0_6px_rgba(244,63,94,0.8)]';
                  }
                }

                let cellClass =
                  'relative h-10 w-full rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all duration-200 cursor-pointer select-none';

                if (isSelected) {
                  cellClass +=
                    ' bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-extrabold shadow-md shadow-primary-600/30 ring-2 ring-primary-300/70 scale-[1.06] z-10';
                } else if (isToday) {
                  cellClass +=
                    ' border-2 border-primary-500 text-primary-700 bg-primary-50/60 hover:bg-primary-100/70 font-bold hover:scale-105';
                } else if (item.isCurrentMonth) {
                  cellClass +=
                    ' text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:scale-105';
                } else {
                  cellClass +=
                    ' text-slate-300 hover:bg-slate-50 hover:text-slate-400';
                }

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(item.dateStr)}
                    className={cellClass}
                    title={`${item.dateStr}${logCount > 0 ? ` (${logCount} logs)` : ''}`}
                  >
                    <span>{item.dayNumber}</span>
                    {dotColorClass && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full -mt-0.5 transition-all ${
                          isSelected ? 'bg-white' : dotColorClass
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mini Legend */}
            <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-500 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                <span className="font-medium">All Logs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                <span className="font-medium">Partial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                <span className="font-medium">Missing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-600 to-indigo-600" />
                <span className="font-medium">Selected</span>
              </div>
            </div>
          </div>

          {/* Selected Day Submission Summary Card */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Date</p>
                <p className="text-sm font-black text-slate-900 mt-0.5">{formattedDate}</p>
              </div>
              <span className={`text-xs font-black px-3 py-1 rounded-full border shadow-2xs ${
                submissionPct >= 50
                  ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {submissionPct}% Submitted
              </span>
            </div>

            {/* Turnout Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-500">
                <span>Team Daily Log Progress</span>
                <span className="font-bold text-slate-700">{submittedCount} of {totalExpected || totalRosterCount} logs</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                  style={{ width: `${totalExpected > 0 ? (submittedCount / totalExpected) * 100 : 0}%` }}
                  title={`Submitted: ${submittedCount}`}
                />
                <div
                  className="bg-gradient-to-r from-rose-400 to-pink-500 h-full transition-all duration-500"
                  style={{ width: `${totalExpected > 0 ? (missingCount / totalExpected) * 100 : 0}%` }}
                  title={`Missing: ${missingCount}`}
                />
              </div>
            </div>

            {/* Breakdown Quick-Filter Cards: Green Submitted vs Red Missing */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Submitted Logs (Green) */}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'submitted' ? 'all' : 'submitted')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  statusFilter === 'submitted'
                    ? 'bg-gradient-to-br from-emerald-100/90 via-emerald-50 to-teal-50 border-emerald-500 ring-2 ring-emerald-300 shadow-md scale-[1.02]'
                    : 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/30 border-emerald-200/80 hover:border-emerald-300 hover:shadow-sm hover:scale-[1.02]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-900">Submitted</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-emerald-700 mt-1 tracking-tight">{submittedCount}</p>
                <p className="text-[10px] text-emerald-600 font-semibold">Daily Logs Filed</p>
              </button>

              {/* Missing Logs (Red) */}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  statusFilter === 'missing'
                    ? 'bg-gradient-to-br from-rose-100/90 via-rose-50 to-pink-50 border-rose-500 ring-2 ring-rose-300 shadow-md scale-[1.02]'
                    : 'bg-gradient-to-br from-rose-50/70 via-white to-pink-50/30 border-rose-200/80 hover:border-rose-300 hover:shadow-sm hover:scale-[1.02]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-900">Missing</span>
                  <XCircle size={16} className="text-rose-600" />
                </div>
                <p className="text-2xl font-black text-rose-700 mt-1 tracking-tight">{missingCount}</p>
                <p className="text-[10px] text-rose-600 font-semibold">Report Pending</p>
              </button>
            </div>

            {/* Tip Banner */}
            <div className="text-[11px] text-slate-500 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/60 leading-relaxed flex items-start gap-2">
              <Sparkles size={15} className="text-primary-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Tip:</strong> Click any date with a dot to view submitted daily logs or add logs on behalf of missing team members.
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Toolbar & Dedicated Scrollable Employee List */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 space-y-4">
          {/* Top Filter & Toolbar Card */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-3.5">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* All Staff Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-[1.02]'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Members ({totalRosterCount})
                </button>

                {/* Submitted (Green) Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('submitted')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    statusFilter === 'submitted'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]'
                      : 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-200/80'
                  }`}
                >
                  <CheckCircle2 size={14} />
                  Submitted ({submittedCount})
                </button>

                {/* Missing (Red) Tab */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('missing')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    statusFilter === 'missing'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/25 scale-[1.02]'
                      : 'bg-rose-50 hover:bg-rose-100/80 text-rose-700 border border-rose-200/80'
                  }`}
                >
                  <XCircle size={14} />
                  Missing ({missingCount})
                </button>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={fetchLogs}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                title="Refresh daily logs"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin text-primary-600' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search team member by name or designation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 pr-8 text-xs py-2 w-full border-slate-200 bg-white text-slate-900 shadow-2xs rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List Status Summary Bar */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
            <span>
              Showing <strong className="text-slate-800">{totalVisibleCount}</strong> team member{totalVisibleCount !== 1 ? 's' : ''} for {formattedDate}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> {submittedCount} Submitted
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> {missingCount} Missing
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* SCROLLABLE CONTAINER FOR EMPLOYEE DAILY LOG CARDS         */}
          {/* ========================================================= */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-sm">
              <Loader2 className="animate-spin text-primary-600 mb-3" size={34} />
              <p className="text-xs font-bold text-slate-700">Loading daily logs for {selectedDate}...</p>
              <p className="text-[11px] text-slate-400 mt-1">Retrieving employee task sheets and attendance</p>
            </div>
          ) : totalVisibleCount === 0 ? (
            <div className="card text-center py-16 border border-slate-200/80 bg-white/95 shadow-sm rounded-2xl">
              <FileText className="mx-auto text-slate-300 mb-2.5" size={42} />
              <p className="text-sm font-bold text-slate-800">No logs expected or matching criteria</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No team member daily logs found for {selectedDate} with the current filter settings.
              </p>
              {(statusFilter !== 'all' || search.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSearch('');
                  }}
                  className="mt-4 px-3.5 py-1.5 text-xs font-black text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200 transition-all hover:scale-105 cursor-pointer shadow-2xs"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-275px)] min-h-[460px] pr-2 custom-scrollbar pb-6">
              {/* Render Submitted Daily Logs (Green) */}
              {statusFilter !== 'missing' &&
                filteredSubmittedLogs.map((log) => {
                  const att = log.attendance;
                  const checkIn = att?.checkInTime ? formatTime(att.checkInTime) : (log.checkInTime ? formatTime(log.checkInTime) : '—');
                  const checkOut = att?.checkOutTime ? formatTime(att.checkOutTime) : (log.checkOutTime ? formatTime(log.checkOutTime) : '—');
                  const hours = log.hoursSpent ? `${log.hoursSpent}h` : '—';

                  return (
                    <div
                      key={log._id}
                      className="group p-4 transition-all duration-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 bg-gradient-to-r from-emerald-500/[0.04] via-white to-white border border-slate-200/90 border-l-[5px] border-l-emerald-500 hover:border-emerald-300"
                    >
                      {/* Employee Profile Info */}
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 border shadow-2xs transition-transform group-hover:scale-105 bg-emerald-50 text-emerald-700 border-emerald-200 ring-2 ring-emerald-400/30">
                          {log.userId?.avatarUrl ? (
                            <img
                              src={log.userId.avatarUrl}
                              alt={log.userId.name}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          ) : (
                            log.userId?.name?.charAt(0).toUpperCase() || 'U'
                          )}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm truncate">
                              {log.userId?.name || 'Team Member'}
                            </span>

                            {/* Manager Submission/Edit Tag */}
                            {(log.submissionType === 'manager' || log.isEdited) && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200 shadow-2xs">
                                {log.isEdited ? 'Edited by Manager' : 'Uploaded by Manager'}
                              </span>
                            )}
                          </div>

                          <p className="text-slate-500 text-xs font-medium truncate">
                            {log.userId?.designation || 'Staff Member'}
                          </p>

                          {/* Task summary or note snippet if available */}
                          {log.tasks && log.tasks.length > 0 && (
                            <p className="text-[11px] text-slate-600 line-clamp-1 italic mt-1">
                              "{log.tasks[0]?.taskName || log.tasks[0]?.description || 'Task logged'}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Shift Timings & Actions Section */}
                      <div className="flex items-center gap-4 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        {/* Timings */}
                        <div className="text-left md:text-right space-y-0.5">
                          <p className="text-xs text-slate-700 font-medium flex items-center md:justify-end gap-1.5">
                            <Clock size={12} className="text-emerald-600" />
                            <span>In: <strong className="text-slate-900 font-black">{checkIn}</strong></span>
                            {checkOut !== '—' && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span>Out: <strong className="text-slate-900 font-black">{checkOut}</strong></span>
                              </>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 font-semibold">
                            Work Hours: <span className="text-emerald-700 font-black">{hours}</span>
                          </p>
                        </div>

                        {/* Status Badge */}
                        <span className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full font-black border shadow-2xs bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-800">
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          Submitted
                        </span>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setUploadLogData({ user: log.userId, isEdit: true, existingLog: log })}
                            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:opacity-95 transition-all hover:scale-105 active:scale-95 shadow-sm shadow-primary-500/25 cursor-pointer"
                          >
                            View Report
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Render Missing Members (Red) */}
              {statusFilter !== 'submitted' &&
                filteredMissingMembers.map((member) => (
                  <div
                    key={member._id}
                    className="group p-4 transition-all duration-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 bg-gradient-to-r from-rose-500/[0.04] via-white to-white border border-slate-200/90 border-l-[5px] border-l-rose-500 hover:border-rose-300"
                  >
                    {/* Employee Profile Info */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 border shadow-2xs transition-transform group-hover:scale-105 bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-400/30">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          member.name?.charAt(0).toUpperCase() || 'U'
                        )}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <span className="font-extrabold text-slate-900 text-sm truncate block">
                          {member.name}
                        </span>
                        <p className="text-rose-600 text-xs font-semibold truncate">
                          Missing Daily Work Log
                        </p>
                      </div>
                    </div>

                    {/* Shift Timings & Actions Section */}
                    <div className="flex items-center gap-4 flex-shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                      {/* Timings */}
                      <div className="text-left md:text-right space-y-0.5">
                        <p className="text-xs text-slate-400 font-medium italic">
                          In: — · Out: — (No daily submission)
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          Expected daily report pending
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full font-black border shadow-2xs bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200 text-rose-800">
                        <XCircle size={14} className="text-rose-600" />
                        Missing
                      </span>

                      {/* Action Button: Add Log */}
                      <button
                        type="button"
                        onClick={() => setUploadLogData({ user: member, isEdit: false, existingLog: null })}
                        className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white transition-all hover:scale-105 active:scale-95 shadow-sm shadow-rose-600/25 cursor-pointer flex items-center gap-1"
                      >
                        <Plus size={14} />
                        + Add Log
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
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



// ── Manager Profile Page ─────────────────────────────────────────────────────
const ManagerProfilePage = () => {
  const { user, setUser } = useAuth();
  const fileInputRef = useState(null)[0];
  const [fileRef, setFileRef] = useState(null);
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Name cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, avatarUrl: avatarPreview };
      const res = await api.patch('/employee/profile', payload);
      const updatedUser = res.data?.data?.user;
      if (updatedUser) setUser(updatedUser);
      setMessage({ type: 'success', text: 'Profile updated successfully ✓' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save profile.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'M';

  return (
    <div className="page-container max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/25">
          <UserCircle2 size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Profile</h1>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Update your personal info and profile photo.</p>
        </div>
      </div>

      {/* Notification */}
      {message && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {message.text}
        </div>
      )}

      {/* Avatar Card */}
      <div className="card bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] flex flex-col items-center gap-4">
        <div className="relative group">
          {/* Avatar */}
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt={user?.name}
              className="w-24 h-24 rounded-2xl object-cover ring-4 ring-violet-100 shadow-xl"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-rose-400 flex items-center justify-center text-white text-3xl font-black shadow-xl ring-4 ring-violet-100">
              {initials}
            </div>
          )}
          {/* Upload overlay */}
          <button
            onClick={() => fileRef?.click()}
            className="absolute inset-0 rounded-2xl bg-slate-900/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Camera size={20} className="text-white" />
            <span className="text-white text-[10px] font-bold">Change Photo</span>
          </button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={setFileRef}
            onChange={handleFileChange}
          />
        </div>
        <div className="text-center">
          <p className="font-black text-slate-900 text-lg">{user?.name}</p>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold mt-1">
            <Shield size={11} /> Manager
          </span>
        </div>
        {avatarPreview !== user?.avatarUrl && (
          <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
            ⚠ Unsaved photo — click Save to apply
          </p>
        )}
      </div>

      {/* Info Fields Card */}
      <div className="card bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] space-y-5">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <Edit3 size={15} className="text-violet-500" /> Personal Information
        </h2>

        {/* Editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <UserCircle2 size={12} /> Full Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              placeholder="Your full name"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Phone size={12} /> Phone
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Designation */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Briefcase size={12} /> Designation
            </label>
            <input
              type="text"
              value={form.designation}
              onChange={e => setForm({ ...form, designation: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              placeholder="e.g. Engineering Manager"
            />
          </div>

          {/* Team */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Users size={12} /> Team
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed">
              {user?.teamId?.name || '—'}
            </div>
          </div>
        </div>

        {/* Read-only fields */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Mail size={12} /> Email
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed">
              {user?.email}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Shield size={12} /> Role
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed capitalize">
              {user?.role}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-bold rounded-xl shadow-md shadow-violet-500/25 transition-all active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="animate-spin text-violet-600" size={40} /></div>;

  return (
    <Routes location={location}>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <ManagerLayout>
            <Routes location={location} key={location.pathname}>
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
              <Route path="/profile" element={<ManagerProfilePage />} />
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

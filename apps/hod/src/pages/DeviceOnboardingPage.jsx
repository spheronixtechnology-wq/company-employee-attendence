import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Loader2, CheckCircle, AlertTriangle, Smartphone, Monitor, ShieldCheck, ArrowRight, Shield } from 'lucide-react';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { useSocket } from '../contexts/SocketContext';
import { getDeviceInfo } from '../lib/deviceNames';

const DeviceOnboardingPage = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState(null);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [isMobile, setIsMobile] = useState(true);
  const [currentStatus, setCurrentStatus] = useState(null); // 'pending' | 'active' | 'rejected' | null
  const { socket } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      setChecking(true);
      // Automatically detect device name & model
      const info = await getDeviceInfo();
      setDeviceLabel(info.fullLabel || 'Mobile Device');
      setIsMobile(info.isMobile);

      // Check current device status — don't show the form if already pending/active
      try {
        const res = await api.get('/employee/device-status');
        const statusType = res.data?.data?.deviceStatus?.statusType;
        if (statusType === 'active' || statusType === 'temporary') {
          setCurrentStatus('active');
        } else if (statusType === 'pending') {
          setCurrentStatus('pending');
        } else if (statusType === 'rejected') {
          setCurrentStatus('rejected');
        }
      } catch {}

      setChecking(false);
    };
    init();
  }, []);

  // Real-time listener for manager's approval or rejection
  useEffect(() => {
    if (!socket) return;
    const onResolved = (data) => {
      if (data.action === 'approve') {
        setCurrentStatus('active');
        setMessage({ type: 'success', text: 'Device approved by manager! You can now mark attendance.' });
      } else if (data.action === 'reject') {
        setCurrentStatus('rejected');
        setMessage({ type: 'error', text: `Device request rejected: ${data.decisionNote || 'No note provided'}` });
      }
    };
    socket.on('device:request_resolved', onResolved);
    return () => {
      socket.off('device:request_resolved', onResolved);
    };
  }, [socket]);

  const handleRequest = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const fp = await getDeviceFingerprint();
      await api.post('/employee/device/request', {
        requestedDeviceLabel: deviceLabel,
        deviceFingerprint: fp
      });
      setMessage({
        type: 'success',
        text: 'Device approval requested successfully. You will be notified once your manager approves.'
      });
      setCurrentStatus('pending');
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to request device approval.' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <Loader2 size={40} className="animate-spin text-violet-600 relative z-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-100px)] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-violet-500/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
      <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-indigo-500/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-1/3 w-80 h-80 bg-fuchsia-500/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/90 backdrop-blur-3xl border border-white/60 rounded-[32px] p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05),0_0_40px_rgba(139,92,246,0.15)] transition-all duration-500">
          
          <div className="flex flex-col items-center text-center">
            
            {/* Dynamic Animated Icon */}
            <div className="relative mb-8 group">
              <div className="absolute inset-0 bg-gradient-to-tr from-violet-400 to-fuchsia-400 rounded-3xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500 animate-pulse"></div>
              <div className="relative w-24 h-24 bg-gradient-to-tr from-white to-violet-50 rounded-3xl border border-white/80 shadow-[0_8px_20px_rgba(139,92,246,0.15)] flex items-center justify-center transform transition-transform duration-500 hover:scale-105 hover:-rotate-3">
                {currentStatus === 'active' ? (
                  <ShieldCheck size={36} className="text-emerald-500 drop-shadow-sm" />
                ) : currentStatus === 'pending' ? (
                  <Shield size={36} className="text-amber-500 drop-shadow-sm animate-bounce" />
                ) : (
                  <ShieldAlert size={36} className="text-rose-500 drop-shadow-sm" />
                )}
              </div>
            </div>

            {currentStatus === 'active' ? (
              <div className="w-full animate-fade-in-up">
                <h1 className="text-3xl font-extrabold bg-gradient-to-br from-slate-800 to-slate-500 bg-clip-text text-transparent mb-3 tracking-tight">Access Granted</h1>
                <p className="text-slate-500 mb-8 leading-relaxed">Your device is successfully registered. You are fully authenticated to mark attendance.</p>
                <button onClick={() => navigate('/dashboard')} className="group relative w-full flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 text-white font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95">
                  <span className="relative z-10 flex items-center gap-2">Go to Dashboard <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></span>
                </button>
              </div>
            ) : currentStatus === 'pending' ? (
              <div className="w-full animate-fade-in-up">
                <h1 className="text-3xl font-extrabold bg-gradient-to-br from-slate-800 to-slate-500 bg-clip-text text-transparent mb-3 tracking-tight">Approval Pending</h1>
                <p className="text-slate-500 mb-8 leading-relaxed">Your device registration request has been securely routed and is awaiting manager approval.</p>
                
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/50 text-amber-700 text-sm mb-8 flex items-center gap-3 shadow-[inset_0_2px_10px_rgba(251,191,36,0.1)]">
                  <Loader2 size={20} className="animate-spin text-amber-500 flex-shrink-0" />
                  <span className="font-semibold">Waiting for manager approval...</span>
                </div>

                <button onClick={() => navigate('/dashboard')} className="w-full py-4 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">
                  Back to Dashboard
                </button>
              </div>
            ) : (
              <div className="w-full animate-fade-in-up">
                <h1 className="text-[32px] leading-tight font-extrabold bg-gradient-to-br from-slate-800 to-slate-500 bg-clip-text text-transparent mb-4 tracking-tight">Device Verification</h1>
                <p className="text-slate-500 mb-8 text-[15px] leading-relaxed">
                  To ensure maximum security, this device must be registered with your manager before marking attendance.
                </p>

                {/* Premium Device Card */}
                <div className="relative group mb-8 text-left">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-200 to-fuchsia-200 rounded-2xl blur-md opacity-40 transition duration-500 group-hover:opacity-70 group-hover:blur-lg"></div>
                  <div className="relative p-5 rounded-2xl bg-white/80 backdrop-blur-xl border border-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center gap-4 transition-transform duration-300 group-hover:-translate-y-0.5">
                    <div className="w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center flex-shrink-0 border border-violet-100 shadow-inner">
                      {isMobile ? (
                        <Smartphone size={26} className="text-violet-600" />
                      ) : (
                        <Monitor size={26} className="text-violet-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-violet-500 mb-1">Detected Device</p>
                      <p className="text-slate-800 font-bold text-base">{deviceLabel}</p>
                    </div>
                  </div>
                </div>

                {message && (
                  <div className={`p-4 rounded-2xl mb-8 flex items-start gap-3 text-sm font-semibold text-left shadow-sm border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    {message.type === 'success' ? <CheckCircle size={20} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />}
                    {message.text}
                  </div>
                )}

                <button
                  onClick={handleRequest}
                  disabled={loading || message?.type === 'success'}
                  className="group relative w-full flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 text-white font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                >
                  {loading ? (
                    <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Submitting Request...</span>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2">Request Secure Access <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></span>
                  )}
                  {/* Button shine effect */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceOnboardingPage;

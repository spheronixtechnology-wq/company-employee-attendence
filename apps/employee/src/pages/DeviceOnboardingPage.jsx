import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Loader2, CheckCircle, AlertTriangle, Smartphone, Monitor } from 'lucide-react';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { useSocket } from '../contexts/SocketContext';

// Build a readable device label from navigator info (client-side)
const getDeviceLabel = async () => {
  try {
    // Chrome/Android: use high-entropy UA data for precise model
    if (navigator.userAgentData?.getHighEntropyValues) {
      const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
      const model = hints.model || '';
      const platform = hints.platform || '';
      const version = hints.platformVersion || '';
      const parts = [model, platform && version ? `${platform} ${version}` : platform].filter(Boolean);
      if (parts.length) return parts.join(' · ');
    }
  } catch {}
  // Fallback: parse the classic UA string
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone · Safari · iOS';
  if (/iPad/i.test(ua)) return 'iPad · Safari · iPadOS';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android ([0-9.]+)/);
    return `Android Device${match ? ' · Android ' + match[1] : ''}`;
  }
  if (/Windows/i.test(ua)) return 'Windows · Desktop';
  if (/Mac/i.test(ua)) return 'macOS · Desktop';
  return 'Unknown Device';
};

const DeviceOnboardingPage = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState(null);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [currentStatus, setCurrentStatus] = useState(null); // 'pending' | 'active' | 'rejected' | null
  const { socket } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      setChecking(true);
      // Detect device name
      const label = await getDeviceLabel();
      setDeviceLabel(label);

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
      await api.post('/employee/device/request', { requestedDeviceLabel: deviceLabel, deviceFingerprint: fp });
      setMessage({ type: 'success', text: 'Device approval requested successfully. You will be notified once your manager approves.' });
      setCurrentStatus('pending');
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to request device approval.' });
    } finally {
      setLoading(false);
    }
  };

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-md mx-auto mt-8">
      <div className="card p-8 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 shadow-xl backdrop-blur-sm text-center">
        <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert size={32} className="text-amber-400" />
        </div>

        {currentStatus === 'active' ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Device Already Active</h1>
            <p className="text-slate-400 mb-6">Your device is already registered and active. You can mark attendance now.</p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">
              Go to Dashboard
            </button>
          </>
        ) : currentStatus === 'pending' ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Approval Pending</h1>
            <p className="text-slate-400 mb-6">Your device registration request is awaiting manager approval. You'll be notified when it's approved.</p>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm mb-5 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin flex-shrink-0" />
              Waiting for manager approval...
            </div>
            <button onClick={() => navigate('/dashboard')} className="btn-ghost w-full">
              Back to Dashboard
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Device Not Recognized</h1>
            <p className="text-slate-400 mb-5">
              Register this device with your manager to mark attendance.
            </p>

            {/* Device confirmation card */}
            <div className="p-4 rounded-2xl bg-slate-700/50 border border-slate-600/60 mb-6 text-left">
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Device to Register</p>
              <div className="flex items-center gap-3">
                {isMobile ? (
                  <Smartphone size={28} className="text-violet-400 flex-shrink-0" />
                ) : (
                  <Monitor size={28} className="text-violet-400 flex-shrink-0" />
                )}
                <div>
                  <p className="text-white font-semibold text-sm">{deviceLabel}</p>
                  <p className="text-slate-500 text-xs">This info will be visible to your manager</p>
                </div>
              </div>
            </div>

            {message && (
              <div className={`p-3 rounded-xl mb-5 flex items-start gap-3 text-sm text-left ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                {message.type === 'success' ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
                {message.text}
              </div>
            )}

            <button
              onClick={handleRequest}
              disabled={loading || message?.type === 'success'}
              className="btn-primary w-full flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Submitting Request...' : 'Request Device Approval'}
            </button>

            {!isMobile && (
              <p className="text-slate-500 text-xs mt-4">
                💡 For attendance, use this portal on your registered mobile device.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DeviceOnboardingPage;


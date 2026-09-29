import { useState, useEffect, useRef } from 'react';
import { X, QrCode, Smartphone, Loader2, MapPin, AlertTriangle, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import api from '../../lib/api';
import { useSocket } from '../../contexts/SocketContext';

export default function CheckoutQrModal({ isOpen, onClose, onSuccess, getLocation }) {
  const { socket } = useSocket();
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(60);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  // 1. Initialize checkout session and generate QR
  const startCheckoutSession = async () => {
    setLoading(true);
    setError(null);
    setTimeLeft(60);
    try {
      const res = await api.post('/employee/attendance/initiate-checkout');
      const { token } = res.data.data;
      
      // Generate QR data URL
      const qrDataString = JSON.stringify({ type: 'CHECKOUT_QR', token });
      const url = await QRCode.toDataURL(qrDataString, {
        width: 260,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrUrl(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate checkout QR.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    startCheckoutSession();

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // 2. Listen to socket for checkout completion from mobile
  useEffect(() => {
    if (!socket || !isOpen) return;

    const onCheckedOut = (data) => {
      console.log('⚡ [Checkout QR Modal] Received attendance:checked_out from socket');
      if (onSuccess) onSuccess(data);
    };

    socket.on('attendance:checked_out', onCheckedOut);
    return () => {
      socket.off('attendance:checked_out', onCheckedOut);
    };
  }, [socket, isOpen, onSuccess]);

  // 3. Escape Hatch: Check out with Location directly on PC
  const handleLocationFallback = async () => {
    setFallbackLoading(true);
    setError(null);
    try {
      const loc = await getLocation();
      const res = await api.post('/employee/attendance/check-out', {
        lat: loc.lat,
        lng: loc.lng,
      });
      if (onSuccess) onSuccess(res.data?.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Location checkout failed.');
    } finally {
      setFallbackLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 text-primary-400 mb-3">
          <QrCode size={24} />
        </div>
        <h2 className="text-lg font-bold text-white">Scan to Check Out</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
          Open your registered phone to scan this screen and finalize your shift.
        </p>

        {/* Error Notice */}
        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-xs text-left">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* QR Code Container */}
        <div className="my-5 flex flex-col items-center justify-center min-h-[260px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <Loader2 size={36} className="animate-spin text-primary-400" />
              <p className="text-xs text-slate-400">Generating secure QR code...</p>
            </div>
          ) : qrUrl ? (
            <div className="p-3 bg-white rounded-2xl shadow-xl shadow-primary-500/5 border border-slate-200 animate-in zoom-in-95 duration-200">
              <img src={qrUrl} alt="Checkout QR Code" className="w-56 h-56 rounded-lg object-contain" />
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-8">Unable to generate QR code.</div>
          )}
        </div>

        {/* Mobile Camera Indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mb-4 bg-slate-800/50 py-2 px-3 rounded-xl border border-slate-800">
          <Smartphone size={15} className="text-primary-400 animate-pulse" />
          <span>Camera scanner waking up on your phone...</span>
        </div>

        {/* Timer Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full transition-all duration-1000 ${
              timeLeft > 20 ? 'bg-primary-500' : 'bg-amber-500'
            }`}
            style={{ width: `${(timeLeft / 60) * 100}%` }}
          />
        </div>

        {/* Escape Hatch Button */}
        <div className="pt-2 border-t border-slate-800">
          <p className="text-[11px] text-slate-500 mb-2">
            Phone not available or scanner not opening?
          </p>
          <button
            id="pc-location-checkout-btn"
            onClick={handleLocationFallback}
            disabled={fallbackLoading}
            className="btn-ghost w-full py-2.5 text-xs text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-1.5 transition-all"
          >
            {fallbackLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} className="text-emerald-400" />}
            {fallbackLoading ? 'Verifying PC Location...' : 'Check out with PC Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

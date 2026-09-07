import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import {
  LogIn, LogOut, Coffee, Timer, FileText, Bell,
  CheckCircle, XCircle, Clock, Wifi, Smartphone, QrCode,
  AlertTriangle, Loader2, MapPin, Shield,
  ChevronRight, Camera, Info, Monitor, X
} from 'lucide-react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import QRCode from 'qrcode';
import { useSocket } from '../contexts/SocketContext';
import DailyLogModal from '../components/checkout/DailyLogModal';
import CheckoutQrModal from '../components/checkout/CheckoutQrModal';
import AttendanceReportModal from '../components/checkout/AttendanceReportModal';


// ── Camera-Only QR Scanner ─────────────────────────────────────────────────────
// Uses Html5QrcodeScanner with SCAN_TYPE_CAMERA only — no image upload, no drag-drop.
// This is the most reliable approach for rear-camera scanning on Android & iOS.
const CameraQrScanner = ({ onScan, onCancel }) => {
  const scannerId = 'qr-office-reader';

  useEffect(() => {
    // Small delay to ensure DOM element is mounted before starting camera
    const timer = setTimeout(() => {
      let scanner;
      try {
        scanner = new Html5QrcodeScanner(
          scannerId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            // CRITICAL: camera-only mode — removes all image upload / drag-drop UI
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            videoConstraints: { facingMode: { ideal: 'environment' } }, // prefer rear camera
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: false,
          },
          /* verbose= */ false
        );
        scanner.render(
          (decodedText) => {
            try { scanner.clear(); } catch {}
            onScan(decodedText);
          },
          () => {} // suppress per-frame decode errors
        );
      } catch (err) {
        console.error('QR scanner init error:', err);
      }

      // Store scanner reference on the DOM node for cleanup
      const el = document.getElementById(scannerId);
      if (el) el.__scanner = scanner;
    }, 100); // 100ms delay ensures element is in the DOM

    return () => {
      clearTimeout(timer);
      const el = document.getElementById(scannerId);
      if (el?.__scanner) {
        try { el.__scanner.clear(); } catch {}
      }
    };
  }, [onScan]);

  return (
    <div>
      {/* The scanner renders a camera feed here. No image upload shown. */}
      <div id={scannerId} className="w-full" />
      <button
        onClick={onCancel}
        className="btn-ghost w-full mt-3 text-xs py-2.5"
      >
        <X size={14} /> Cancel Scanning
      </button>
    </div>
  );
};


// ── Format Helpers ─────────────────────────────────────────────────────────────
const formatDuration = (mins = 0) => {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const formatTimerSeconds = (sec = 0) => {
  const s = Math.max(0, Math.floor(sec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

// ── Main Work Timer Component (Runs continuously from checkInTime) ─────────────
const MainWorkTimer = ({ checkInTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!checkInTime) return;
    const calc = () => {
      const ms = Date.now() - new Date(checkInTime).getTime();
      return Math.max(0, Math.floor(ms / 1000));
    };
    setElapsed(calc());
    const interval = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime]);

  return (
    <div className="font-mono text-3xl sm:text-4xl font-extrabold text-white tracking-wider">
      {formatTimerSeconds(elapsed)}
    </div>
  );
};

// ── Break Timer Component (Runs continuously from break startedAt) ────────────
const BreakTimer = ({ startedAt }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const calc = () => {
      const ms = Date.now() - new Date(startedAt).getTime();
      return Math.max(0, Math.floor(ms / 1000));
    };
    setElapsed(calc());
    const interval = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="font-mono text-3xl font-extrabold text-amber-400 tracking-wider">
      {formatTimerSeconds(elapsed)}
    </div>
  );
};

// ── Daily Attendance Report (Rendered upon Check-Out) ──────────────────────────
const DailyAttendanceReport = ({ attendance }) => {
  const breaks = attendance?.breaks || [];
  const checkIn = attendance?.checkInTime ? new Date(attendance.checkInTime) : null;
  const checkOut = attendance?.checkOutTime ? new Date(attendance.checkOutTime) : null;
  
  const totalDurationMins = attendance?.totalDurationMinutes ?? 
    (checkIn && checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)) : 0);
  const totalBreakMins = attendance?.totalBreakMinutes ?? (attendance?.completedBreakMinutes || 0);
  const actualWorkMins = attendance?.actualWorkMinutes ?? Math.max(0, totalDurationMins - totalBreakMins);

  const formatTime = (d) => d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      {/* Completion Header */}
      <div className="p-5 bg-gradient-to-br from-emerald-500/15 via-slate-900/90 to-slate-900 border border-emerald-500/30 rounded-2xl text-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-2.5 shadow-lg shadow-emerald-500/10">
          <CheckCircle size={26} />
        </div>
        <h3 className="font-bold text-white text-lg">Daily Attendance Report</h3>
        <p className="text-slate-400 text-xs mt-0.5">
          Shift completed for today
        </p>
        <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-slate-800/90 text-slate-300 text-xs border border-slate-700">
          <Clock size={12} className="text-primary-400" />
          <span>{checkIn ? checkIn.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
          <span className="text-slate-600">·</span>
          <StatusBadge status={attendance?.status || 'present'} />
        </div>
      </div>

      {/* 3 Metrics Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-center">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-1.5">
            <Clock size={15} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Total Duration</p>
          <p className="text-sm sm:text-base font-bold text-white mt-0.5">{formatDuration(totalDurationMins)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Gross Shift</p>
        </div>

        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-center">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-1.5">
            <Coffee size={15} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Total Breaks</p>
          <p className="text-sm sm:text-base font-bold text-amber-400 mt-0.5">{formatDuration(totalBreakMins)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{breaks.length} break{breaks.length === 1 ? '' : 's'}</p>
        </div>

        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-center">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-1.5">
            <Timer size={15} />
          </div>
          <p className="text-[11px] text-emerald-400/90 font-medium">Actual Work</p>
          <p className="text-sm sm:text-base font-extrabold text-emerald-300 mt-0.5">{formatDuration(actualWorkMins)}</p>
          <p className="text-[10px] text-emerald-400/60 mt-0.5">Net Productive</p>
        </div>
      </div>

      {/* Check-In / Check-Out Times */}
      <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <LogIn size={13} className="text-emerald-400" /> Check-in Time:
          </span>
          <span className="font-semibold text-white">{formatTime(checkIn)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
          <span className="text-slate-400 flex items-center gap-1.5">
            <LogOut size={13} className="text-red-400" /> Check-out Time:
          </span>
          <span className="font-semibold text-white">{formatTime(checkOut)}</span>
        </div>
      </div>

      {/* Break History Breakdown */}
      <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coffee size={15} className="text-amber-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Break Breakdown</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {formatDuration(totalBreakMins)}
          </span>
        </div>

        {breaks.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-3 bg-slate-800/30 rounded-lg">
            No breaks recorded during this shift.
          </p>
        ) : (
          <div className="space-y-2">
            {breaks.map((b, idx) => {
              const bStart = b.startedAt ? new Date(b.startedAt) : null;
              const bEnd = b.endedAt ? new Date(b.endedAt) : null;
              const durationMins = (bStart && bEnd) 
                ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 60000)) 
                : 0;
              const typeLabel = b.type ? (b.type.charAt(0).toUpperCase() + b.type.slice(1)) : 'Personal';

              return (
                <div key={b._id || idx} className="flex items-center justify-between p-2.5 bg-slate-800/50 rounded-lg text-xs border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 font-bold flex items-center justify-center text-[10px]">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{typeLabel} Break</p>
                      <p className="text-[11px] text-slate-400">
                        {formatTime(bStart)} – {formatTime(bEnd)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-medium font-mono text-xs border border-amber-500/20">
                      {durationMins}m
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Geolocation Hook ───────────────────────────────────────────────────────────
const useGeolocation = () => {
  const [geoError, setGeoError] = useState(null);
  const [loading, setLoading] = useState(false);
  const getLocation = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported.')); return; }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeoError(null); setLoading(false); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => {
        const msg = err.code === 1
          ? 'Location Access Required — please allow location access to verify your work location.'
          : 'Unable to get your location. Please try again.';
        setGeoError(msg); setLoading(false); reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }), []);
  return { geoError, loading, getLocation };
};

// ── Status Badge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    present: { cls: 'badge-success', label: 'Present' },
    half_day: { cls: 'badge-warning', label: 'Half Day' },
    absent: { cls: 'badge-danger', label: 'Absent' },
    leave: { cls: 'badge-info', label: 'On Leave' },
    manual_pending: { cls: 'badge-warning', label: 'Pending' },
    incomplete: { cls: 'badge-warning', label: 'Incomplete' },
  };
  const s = map[status] || { cls: 'badge-gray', label: status };
  return <span className={s.cls}>{s.label}</span>;
};

// ── Device Status Card ─────────────────────────────────────────────────────────
const DeviceStatusCard = ({ deviceStatus, navigate }) => {
  if (!deviceStatus) return null;
  const { statusType, statusLabel, device } = deviceStatus;

  const cfg = {
    active:    { dot: 'bg-emerald-400', color: 'text-emerald-400', desc: 'This device is registered and authorized for attendance.' },
    temporary: { dot: 'bg-amber-400',   color: 'text-amber-400',   desc: `Temporary access expires ${device?.temporaryUntil ? new Date(device.temporaryUntil).toLocaleDateString('en-IN') : 'soon'}.` },
    pending:   { dot: 'bg-blue-400',    color: 'text-blue-400',    desc: 'Your registration is awaiting admin approval.' },
    registered_other_device: { dot: 'bg-red-400', color: 'text-red-400', desc: 'You already have another device registered. Request a replacement to use this one.' },
    pending_other_device: { dot: 'bg-amber-400', color: 'text-amber-400', desc: 'You have a pending registration on another device.' },
    none:      { dot: 'bg-red-400',     color: 'text-red-400',     desc: 'This specific browser is not registered. Register it to mark attendance.' },
  }[statusType] || {};

  return (
    <div className="card border border-slate-700/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Smartphone size={16} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">Attendance Device</span>
        </div>
        <button onClick={() => navigate('/device-status')} className="text-xs text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1">
          View <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${statusType === 'active' ? 'animate-pulse' : ''}`} />
        <span className={`font-bold text-sm ${cfg.color}`}>{statusLabel}</span>
      </div>
      {device && (
        <p className="text-xs text-slate-500 mt-1">{device.deviceLabel}</p>
      )}
      <p className="text-xs text-slate-500 mt-1">{cfg.desc}</p>
    </div>
  );
};

// ── Mobile Detection ────────────────────────────────────────────────────────────
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// ── Error Message Formatter ────────────────────────────────────────────────────
const formatAttendanceError = (rawMessage) => {
  if (!rawMessage) return 'An error occurred. Please try again.';
  const msg = rawMessage.toLowerCase();
  if (msg.includes('device replacement')) return rawMessage;
  if (msg.includes('already checked in') || msg.includes('already marked')) return '⚠️ Attendance Already Marked for today.';
  if (msg.includes('expired') || msg.includes('qr code has expired')) return '⏱️ QR Code Expired — please scan the current QR code at the office.';
  if (msg.includes('invalid qr') || msg.includes('invalid qr code')) return '❌ Invalid QR Code — please scan today\'s office QR code.';
  if (msg.includes('pending approval') || msg.includes('registration is pending')) return '⏳ Device Approval Pending — waiting for admin to approve your device.';
  if (msg.includes('not authorized') || msg.includes('revoked') || msg.includes('use your registered')) return '📱 Use Your Registered Mobile — this device is not authorized for attendance.';
  if (msg.includes('not registered for attendance')) return '📱 ' + rawMessage;
  if (msg.includes('geofence') || msg.includes('outside') || msg.includes('authorized office location') || msg.includes('radius')) return '📍 Outside Office Location — you must be within the authorized office to mark attendance.';
  if (msg.includes('camera') || msg.includes('permission')) return '📷 Camera Access Required — please allow camera access to scan the QR code.';
  if (msg.includes('location') || msg.includes('geolocation')) return '📍 Location Access Required — please allow location access to verify your work location.';
  if (msg.includes('fingerprint') || msg.includes('device fingerprint')) return '📱 Use Your Registered Mobile — please open this on your registered mobile device.';
  if (msg.includes('on approved leave')) return '🏖️ You are on approved leave today. Check-in is not allowed.';
  return rawMessage;
};

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getLocation, geoError, loading: geoLoading } = useGeolocation();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [officeQrDataUrl, setOfficeQrDataUrl] = useState('');

  const { socket } = useSocket();
  const [showDailyLogModal, setShowDailyLogModal] = useState(false);
  const [showCheckoutQrModal, setShowCheckoutQrModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCheckoutScanner, setShowCheckoutScanner] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [todayDailyLog, setTodayDailyLog] = useState(null);

  // ── Defined BEFORE the effects below (they depend on these) ────────────────
  const showMessage = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 8000);
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/employee/dashboard');
      setDashboard(res.data.data);
    } catch {
      showMessage('error', 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  // Listen for mobile auto-scanner trigger via socket
  useEffect(() => {
    if (!socket || !isMobileDevice()) return;

    const onInitiateScan = () => {
      console.log('⚡ [Mobile] Received checkout:initiate_scan');
      setShowCheckoutScanner(true);
      if (navigator.vibrate) navigator.vibrate(200);
      showMessage('info', '📷 Camera scanner opened — scan your PC screen to check out.');
    };

    socket.on('checkout:initiate_scan', onInitiateScan);
    return () => {
      socket.off('checkout:initiate_scan', onInitiateScan);
    };
  }, [socket]);

  // Listen for checkout completion on both devices
  useEffect(() => {
    if (!socket) return;

    const onAttendanceCheckedOut = (data) => {
      console.log('⚡ Received attendance:checked_out');
      setShowCheckoutQrModal(false);
      setShowCheckoutScanner(false);
      setReportData(data);
      setShowReportModal(true);
      fetchDashboard();
    };

    socket.on('attendance:checked_out', onAttendanceCheckedOut);
    return () => {
      socket.off('attendance:checked_out', onAttendanceCheckedOut);
    };
  }, [socket, fetchDashboard]);


  // Fetch QR Code for Desktop Display
  useEffect(() => {
    if (!isMobileDevice() && dashboard?.activeMethod === 'qr_code') {
      const fetchQr = async () => {
        try {
          const res = await api.get('/employee/qr/current');
          if (res.data?.data?.qr?.codeValue) {
            const dataUrl = await QRCode.toDataURL(res.data.data.qr.codeValue, { 
              width: 250, margin: 2, color: { dark: '#000000', light: '#ffffff' } 
            });
            setOfficeQrDataUrl(dataUrl);
          }
        } catch (e) {
          // Ignore
        }
      };
      fetchQr();
      const interval = setInterval(fetchQr, 10000);
      return () => clearInterval(interval);
    }
  }, [dashboard?.activeMethod]);

  // Fetch on mount, every 30s, and on tab focus
  useEffect(() => {
    fetchDashboard();
    const intervalId = setInterval(fetchDashboard, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchDashboard();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchDashboard]);

  // Redirect mobile with no device to onboarding
  useEffect(() => {
    if (dashboard?.deviceStatus?.statusType === 'none') {
      const hasPending = dashboard?.deviceStatus?.device?.status === 'PENDING';
      if (!hasPending && isMobileDevice()) {
        navigate('/device-onboarding');
      }
    }
  }, [dashboard, navigate]);


  const handleCheckIn = async (scannedQrValue = null) => {
    const finalQrValue = typeof scannedQrValue === 'string' ? scannedQrValue : null;
    setActionLoading('checkin');
    setShowScanner(false);
    try {
      if (dashboard?.activeMethod === 'qr_code' && !finalQrValue) {
        throw new Error('Please scan the office QR code to check in.');
      }
      const loc = await getLocation();
      const fp = await getDeviceFingerprint();
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        deviceFingerprint: fp,
      };
      if (dashboard?.activeMethod === 'qr_code') payload.qrCodeValue = finalQrValue;

      await api.post('/employee/attendance/check-in', payload);
      showMessage('success', '✅ Attendance Marked Successfully! You are checked in.');
      fetchDashboard();
    } catch (err) {
      const raw = err.response?.data?.message || err.message || 'Check-in failed.';
      showMessage('error', formatAttendanceError(raw));
    } finally {
      setActionLoading('');
    }
  };

  const handleCheckOutClick = () => {
    const isLogSubmitted = dashboard?.dailyLogSubmitted || !!todayDailyLog;

    if (!isLogSubmitted) {
      setShowDailyLogModal(true);
      return;
    }

    if (isMobileDevice()) {
      // Direct mobile checkout (0-second wait!)
      executeCheckout();
    } else {
      setShowCheckoutQrModal(true);
    }
  };

  const handleDailyLogSuccess = (savedLog) => {
    setTodayDailyLog(savedLog);
    setShowDailyLogModal(false);
    showMessage('success', 'Daily log saved!');
    fetchDashboard();

    if (isMobileDevice()) {
      // Direct mobile checkout immediately after log
      executeCheckout();
    } else {
      setShowCheckoutQrModal(true);
    }
  };

  const executeCheckout = async (extraPayload = {}) => {
    setActionLoading('checkout');
    try {
      const loc = await getLocation();
      const fp = await getDeviceFingerprint();
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        deviceFingerprint: fp,
        ...extraPayload,
      };
      const res = await api.post('/employee/attendance/check-out', payload);
      setShowCheckoutScanner(false);
      setShowCheckoutQrModal(false);
      setReportData(res.data?.data);
      setShowReportModal(true);
      showMessage('success', '✅ Checked out successfully!');
      fetchDashboard();
    } catch (err) {
      const raw = err.response?.data?.message || err.message || 'Check-out failed.';
      showMessage('error', formatAttendanceError(raw));
    } finally {
      setActionLoading('');
    }
  };

  const handleMobileCheckoutScan = async (scannedText) => {
    setShowCheckoutScanner(false);
    let token = null;
    try {
      const parsed = JSON.parse(scannedText);
      if (parsed.type === 'CHECKOUT_QR' && parsed.token) {
        token = parsed.token;
      }
    } catch {
      token = scannedText;
    }

    await executeCheckout(token ? { token } : {});
  };

  const handleBreakStart = async (breakType) => {
    setActionLoading('break-start');
    try {
      await api.post('/employee/break/start', { breakType });
      fetchDashboard();
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Failed to start break.');
    } finally {
      setActionLoading('');
    }
  };

  const handleBreakEnd = async () => {
    setActionLoading('break-end');
    try {
      await api.post('/employee/break/end');
      fetchDashboard();
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Failed to end break.');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-primary-400 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const att = dashboard?.attendance;
  const todayAtt = att?.attendance || null;
  const isCheckedIn = !!(todayAtt?.checkInTime);
  const isCheckedOut = !!(todayAtt?.checkOutTime);
  const hasActiveBreak = !!(att?.activeBreak);
  const dailyLogMissing = isCheckedIn && !isCheckedOut && !dashboard?.dailyLogSubmitted;
  const activeMethod = dashboard?.activeMethod;
  const deviceStatus = dashboard?.deviceStatus;

  const isMobile = isMobileDevice();
  // deviceBlocked = true ONLY when device is genuinely not registered or pending.
  // HOWEVER, if the active method is QR Code and we are on a Desktop, 
  // the desktop acts purely as a display screen for the mobile to scan.
  // Therefore, a desktop browser should NEVER be blocked from displaying the QR Code.
  const isDesktopQrDisplay = activeMethod === 'qr_code' && !isMobile;
  const deviceBlocked = !isDesktopQrDisplay && (
    deviceStatus?.statusType === 'none' || 
    deviceStatus?.statusType === 'pending' || 
    deviceStatus?.statusType === 'registered_other_device' || 
    deviceStatus?.statusType === 'pending_other_device'
  );

  return (
    <div className="page-container max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-slate-400 text-sm">Good {getGreeting()},</p>
          <h1 className="text-2xl font-bold text-white">{user?.name?.split(' ')[0]} 👋</h1>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-xs">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          {todayAtt?.status && <StatusBadge status={todayAtt.status} />}
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm mb-4 border animate-in slide-in-from-top-2 duration-300 ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* GeoError Banner */}
      {geoError && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-400 mb-4">
          <MapPin size={14} className="mt-0.5 flex-shrink-0" />
          {geoError}
        </div>
      )}

      <div className="space-y-4">
        {/* ── Trusted Device Status ─────────────────────────────────────── */}
        {!isCheckedIn && <DeviceStatusCard deviceStatus={deviceStatus} navigate={navigate} />}

        {/* ── Device Not Registered / Pending Warning ──────────────────── */}
        {/* Only shown when device is genuinely NOT registered or is pending.  */}
        {!isCheckedIn && !isCheckedOut && deviceBlocked && (
          <div className={`card border ${deviceStatus?.statusType === 'pending' ? 'border-blue-500/30 bg-blue-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-start gap-3">
              {deviceStatus?.statusType === 'pending' ? (
                <Info size={24} className="text-blue-400 mt-1 flex-shrink-0" />
              ) : (
                <Smartphone size={24} className="text-amber-400 mt-1 flex-shrink-0" />
              )}
              <div>
                {deviceStatus?.statusType === 'pending' || deviceStatus?.statusType === 'pending_other_device' ? (
                  <>
                    <p className="font-semibold text-white text-sm">Device Approval Pending</p>
                    <p className="text-xs text-slate-400 mt-1">Your device registration is awaiting admin approval. You will be notified once approved.</p>
                    <button onClick={() => navigate('/device-status')} className="btn-ghost text-xs py-1.5 px-3 mt-2">
                      View Request Status
                    </button>
                  </>
                ) : deviceStatus?.statusType === 'registered_other_device' ? (
                  <>
                    <p className="font-semibold text-white text-sm">Device Not Registered</p>
                    <p className="text-xs text-slate-400 mt-1">
                      This device is not registered for attendance. Your account has another registered attendance device. Attendance can only be marked from your registered device.
                    </p>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-3">
                      <button onClick={() => navigate('/device-status')} className="btn-ghost text-xs py-1.5 px-3">
                        View Registered Device
                      </button>
                      <button onClick={() => navigate('/device-onboarding?type=replacement')} className="btn-primary text-xs py-1.5 px-3">
                        Request Device Replacement
                      </button>
                    </div>
                  </>
                ) : isMobile ? (
                  <>
                    <p className="font-semibold text-white text-sm">No Registered Device</p>
                    <p className="text-xs text-slate-400 mt-1">You must register this mobile device before marking attendance.</p>
                    <button onClick={() => navigate('/device-onboarding')} className="btn-primary text-xs py-1.5 px-3 mt-3">
                      Register Mobile Device
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-white text-sm">No Registered Device</p>
                    <p className="text-xs text-slate-400 mt-1">
                      You must register your mobile device before marking attendance.
                      Open the Employee Portal on your mobile phone and follow the on-screen instructions.
                    </p>
                    <div className="mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                      <p className="text-xs text-slate-300 font-medium mb-1">How to register:</p>
                      <p className="text-xs text-slate-400">Open this portal on your mobile → log in → follow the device registration steps.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Attendance Card ───────────────────────────────────────────── */}
        <div className="card">
          {isCheckedIn && isCheckedOut ? (
            <DailyAttendanceReport attendance={{ ...todayAtt, breaks: todayAtt?.breaks || att?.breaks || [] }} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300">Today's Attendance</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {activeMethod === 'qr_code' && <><QrCode size={12} className="text-primary-400" /> QR Code</>}
                  {activeMethod === 'wifi_ip' && <><Wifi size={12} className="text-primary-400" /> WiFi / IP</>}
                  {activeMethod === 'device_fingerprint' && <><Smartphone size={12} className="text-primary-400" /> Device</>}
                </div>
              </div>

              {/* ── Live Timers (when checked in) ── */}
              {isCheckedIn && (
                <>
                  {!hasActiveBreak ? (
                    <div className="py-4 px-3 bg-slate-900/60 rounded-2xl border border-slate-800 text-center mb-4 relative overflow-hidden">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Main Work Session Active
                      </div>
                      <MainWorkTimer checkInTime={todayAtt?.checkInTime} />
                      <p className="text-slate-400 text-xs mt-1.5">
                        Started at {new Date(todayAtt?.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {(att?.completedBreakMinutes || 0) > 0 && (
                        <div className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-1">
                          <Coffee size={12} className="text-amber-400" />
                          Breaks completed today: <span className="text-amber-300 font-medium">{formatDuration(att.completedBreakMinutes)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mb-4 space-y-3">
                      {/* Active Break Timer Card */}
                      <div className="p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl text-center relative overflow-hidden shadow-lg shadow-amber-500/5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold mb-2">
                          <Coffee size={14} className="animate-bounce" />
                          Active Break ({att.activeBreak?.type ? (att.activeBreak.type.charAt(0).toUpperCase() + att.activeBreak.type.slice(1)) : 'Personal'})
                        </div>
                        <BreakTimer startedAt={att.activeBreak?.startedAt} />
                        <p className="text-amber-300/80 text-xs mt-1">
                          Started at {new Date(att.activeBreak?.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Concurrent Main Work Timer Card */}
                      <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-1">
                          <Timer size={13} className="text-primary-400" />
                          <span>Main Work Timer (Running continuously)</span>
                        </div>
                        <MainWorkTimer checkInTime={todayAtt?.checkInTime} />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Continuous session · Break time will be deducted upon check-out
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Check-in info */}
                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="p-3 bg-slate-800/60 rounded-xl">
                      <p className="text-slate-400 text-xs mb-0.5">Checked In</p>
                      <p className="font-semibold text-white">{new Date(todayAtt.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="p-3 bg-slate-800/60 rounded-xl">
                      <p className="text-slate-400 text-xs mb-0.5">Method</p>
                      <p className="font-semibold text-white capitalize">{todayAtt?.checkInMethod?.replace('_', ' ') || '—'}</p>
                    </div>
                  </div>
                </>
              )}

          {/* ── PRE-CHECK-IN: Method-specific UI ──────────────────────── */}
          {!isCheckedIn && !isCheckedOut && !deviceBlocked && (
            <div className="space-y-3">

              {/* ── QR Code Method ── */}
              {activeMethod === 'qr_code' && (
                <>
                  {isMobile ? (
                    /* MOBILE: Show scanner button */
                    <div>
                      {/* QR info header */}
                      {!showScanner && (
                        <>
                          <div className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                              <QrCode size={18} className="text-primary-400" />
                            </div>
                            <div>
                              <p className="text-white font-semibold text-sm">Office QR Code</p>
                              <p className="text-slate-400 text-xs">Scan the QR code displayed at your office entrance using your registered mobile.</p>
                            </div>
                          </div>
                          <button
                            id="scan-qr-btn"
                            onClick={() => setShowScanner(true)}
                            disabled={!!actionLoading || geoLoading}
                            className="btn-primary btn-lg w-full shadow-lg shadow-primary-500/20"
                          >
                            <Camera size={20} /> Scan Office QR Code to Check In
                          </button>
                        </>
                      )}

                      {/* Inline scanner — renders inside the card, no full-page replace */}
                      {showScanner && (
                        <div className="card border border-primary-500/30 bg-slate-900/60">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                              <QrCode size={18} className="text-primary-400" />
                            </div>
                            <div>
                              <p className="font-bold text-white text-sm">Scan Office QR Code</p>
                              <p className="text-xs text-slate-400">Point your rear camera at the QR code at the office</p>
                            </div>
                          </div>

                          {actionLoading === 'checkin' ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                              <Loader2 size={36} className="animate-spin text-primary-400 mb-4" />
                              <p className="text-white font-semibold text-sm">QR Code Scanned!</p>
                              <p className="text-slate-400 text-xs mt-1">Verifying your location and device…</p>
                            </div>
                          ) : (
                            <CameraQrScanner
                              onScan={(text) => handleCheckIn(text)}
                              onCancel={() => setShowScanner(false)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* DESKTOP: Render the actual Office QR Code to be scanned */
                    <div className="p-5 bg-slate-800/40 rounded-2xl border border-slate-700 text-center">
                      <p className="font-semibold text-white text-sm mb-1">Office Attendance QR</p>
                      <p className="text-xs text-slate-400 mb-4">
                        Scan this QR code using the Employee Portal on your registered mobile device.
                      </p>
                      {officeQrDataUrl ? (
                        <div className="bg-white p-2 rounded-xl inline-block mx-auto mb-4 shadow-lg">
                          <img src={officeQrDataUrl} alt="Office QR Code" className="w-40 h-40" />
                        </div>
                      ) : (
                        <div className="w-40 h-40 bg-slate-700/50 rounded-xl mx-auto mb-4 flex flex-col gap-2 items-center justify-center">
                          <Loader2 size={24} className="animate-spin text-slate-500" />
                          <span className="text-xs text-slate-500">Loading QR...</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2 text-xs text-slate-500 text-left bg-slate-900/50 rounded-xl p-3 border border-slate-800 mb-2">
                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 font-bold flex items-center justify-center flex-shrink-0 text-xs">1</span>Open Employee Portal on your mobile</div>
                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 font-bold flex items-center justify-center flex-shrink-0 text-xs">2</span>Tap "Scan Office QR Code"</div>
                        <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 font-bold flex items-center justify-center flex-shrink-0 text-xs">3</span>Point camera at this QR code</div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── WiFi / IP Method ── */}
              {activeMethod === 'wifi_ip' && (
                <div>
                  <div className="p-3 bg-slate-800/60 rounded-xl text-xs text-slate-400 text-center mb-4 flex items-center justify-center gap-2">
                    <Wifi size={14} className="text-primary-400" />
                    Ensure you are connected to the office WiFi before checking in.
                  </div>
                  <button
                    id="check-in-btn"
                    onClick={handleCheckIn}
                    disabled={!!actionLoading || geoLoading}
                    className="btn-success btn-lg w-full shadow-lg shadow-success-500/20"
                  >
                    {actionLoading === 'checkin' ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
                    {actionLoading === 'checkin' ? 'Verifying Network…' : 'Verify Network & Check In'}
                  </button>
                </div>
              )}

              {/* ── Device Fingerprint Method ── */}
              {activeMethod === 'device_fingerprint' && (
                <div>
                  <div className="p-3 bg-slate-800/60 rounded-xl text-xs text-slate-400 text-center mb-4 flex items-center justify-center gap-2">
                    <Smartphone size={14} className="text-primary-400" />
                    Your registered device will be verified automatically.
                  </div>
                  <button
                    id="check-in-btn"
                    onClick={handleCheckIn}
                    disabled={!!actionLoading || geoLoading}
                    className="btn-success btn-lg w-full shadow-lg shadow-success-500/20"
                  >
                    {actionLoading === 'checkin' ? <Loader2 size={20} className="animate-spin" /> : <Shield size={20} />}
                    {actionLoading === 'checkin' ? 'Verifying Device…' : 'Verify Device & Check In'}
                  </button>
                </div>
              )}

              {/* ── Fallback ── */}
              {!activeMethod && (
                <button
                  id="check-in-btn"
                  onClick={handleCheckIn}
                  disabled={!!actionLoading || geoLoading}
                  className="btn-success btn-lg w-full shadow-lg shadow-success-500/20"
                >
                  {actionLoading === 'checkin' ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
                  {actionLoading === 'checkin' ? 'Checking In…' : 'Check In'}
                </button>
              )}
            </div>
          )}

          {/* Fallback for when device is blocked (prevents empty card) */}
          {!isCheckedIn && !isCheckedOut && deviceBlocked && (
            <div className="p-5 bg-slate-800/40 rounded-2xl border border-slate-700 text-center">
              <Smartphone size={32} className="text-slate-500 mx-auto mb-3" />
              <p className="font-semibold text-white text-sm mb-1">Attendance Requires Registration</p>
              <p className="text-xs text-slate-400 mb-4">
                {deviceStatus?.statusType === 'pending' || deviceStatus?.statusType === 'pending_other_device'
                  ? 'Your registration is pending approval. You will be able to mark attendance once approved.'
                  : deviceStatus?.statusType === 'registered_other_device'
                  ? 'This device is not registered for attendance. Your account has another registered attendance device. Attendance can only be marked from your registered device.'
                  : 'This specific browser is not registered. Please register this browser first.'}
              </p>
              {deviceStatus?.statusType === 'registered_other_device' ? (
                <div className="flex flex-col sm:flex-row justify-center items-center gap-2">
                  <button onClick={() => navigate('/device-status')} className="btn-ghost text-sm py-2 px-4">
                    View Registered Device
                  </button>
                  <button onClick={() => navigate('/device-onboarding?type=replacement')} className="btn-primary text-sm py-2 px-4">
                    Request Device Replacement <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => navigate('/device-status')} 
                  className="btn-primary text-sm py-2"
                >
                  {deviceStatus?.statusType === 'pending' || deviceStatus?.statusType === 'pending_other_device' ? 'View Request Status' : 'Register Device'} <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}

              {/* Check Out Button */}
              {isCheckedIn && (
                <button
                  id="check-out-btn"
                  onClick={handleCheckOutClick}
                  disabled={!!actionLoading || geoLoading}
                  className="btn-danger btn-lg w-full mt-4 shadow-lg shadow-danger-500/20 flex items-center justify-center gap-2"
                >
                  {actionLoading === 'checkout' ? <Loader2 size={20} className="animate-spin" /> : <LogOut size={20} />}
                  {actionLoading === 'checkout' ? 'Checking Out…' : 'Check Out'}
                </button>
              )}

              {/* Mobile Fallback Scan Button */}
              {isMobile && isCheckedIn && (
                <button
                  id="manual-scan-checkout-btn"
                  onClick={() => setShowCheckoutScanner(true)}
                  className="btn-ghost text-xs w-full mt-2 py-2 flex items-center justify-center gap-1.5 border border-slate-700/80 text-slate-300 hover:text-white"
                >
                  <Camera size={14} className="text-primary-400" />
                  Scan PC Screen to Check Out
                </button>
              )}

              {/* Break Controls */}
              {isCheckedIn && (
                <div className="mt-3">
                  {!hasActiveBreak ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id="start-personal-break-btn"
                        onClick={() => handleBreakStart('personal')}
                        disabled={!!actionLoading}
                        className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5 border border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-300 transition-all"
                      >
                        {actionLoading === 'break-start' ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} className="text-amber-400" />}
                        Take Short Break
                      </button>
                      <button
                        id="start-meal-break-btn"
                        onClick={() => handleBreakStart('meal')}
                        disabled={!!actionLoading}
                        className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5 border border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-300 transition-all"
                      >
                        {actionLoading === 'break-start' ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} className="text-orange-400" />}
                        Lunch / Meal Break
                      </button>
                    </div>
                  ) : (
                    <button
                      id="end-break-btn"
                      onClick={handleBreakEnd}
                      disabled={!!actionLoading}
                      className="btn-primary w-full py-3 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                    >
                      {actionLoading === 'break-end' ? <Loader2 size={18} className="animate-spin" /> : <Timer size={18} />}
                      End Break & Resume Focus
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Quick Stats ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center">
            <FileText size={20} className="text-primary-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{dashboard?.pendingLeaves || 0}</p>
            <p className="text-slate-400 text-xs mt-0.5">Pending Leaves</p>
          </div>
          <div className="card text-center">
            <Bell size={20} className="text-warning-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{dashboard?.unreadNotifications || 0}</p>
            <p className="text-slate-400 text-xs mt-0.5">Notifications</p>
          </div>
        </div>

        {/* ── Leave Balances ────────────────────────────────────────────── */}
        {dashboard?.leaveBalances?.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Leave Balance {new Date().getFullYear()}</h2>
            <div className="space-y-3">
              {dashboard.leaveBalances.map((bal) => (
                <div key={bal._id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{bal.leaveTypeId?.name}</p>
                    <p className="text-xs text-slate-500">Used {bal.used} / {bal.allocated} days</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${(bal.allocated - bal.used) <= 2 ? 'text-danger-400' : 'text-success-400'}`}>
                      {bal.allocated - bal.used}
                    </p>
                    <p className="text-xs text-slate-500">remaining</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Daily Log Status ──────────────────────────────────────────── */}
        <div className={`card flex items-center justify-between ${dashboard?.dailyLogSubmitted ? 'border-success-500/30' : 'border-warning-500/30'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${dashboard?.dailyLogSubmitted ? 'bg-success-500/20' : 'bg-warning-500/20'}`}>
              <FileText size={18} className={dashboard?.dailyLogSubmitted ? 'text-success-400' : 'text-warning-400'} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Today's Daily Log</p>
              <p className={`text-xs ${dashboard?.dailyLogSubmitted ? 'text-success-400' : 'text-warning-400'}`}>
                {dashboard?.dailyLogSubmitted ? 'Submitted ✓' : 'Not yet submitted'}
              </p>
            </div>
          </div>
          {!dashboard?.dailyLogSubmitted && (
            <a href="/daily-log" id="submit-log-link" className="btn-primary text-xs px-3 py-2">Submit</a>
          )}
        </div>

        {/* ── How Attendance Works ──────────────────────────────────────── */}
        <div className="card bg-slate-800/30 border border-slate-700/40">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Shield size={14} className="text-primary-400" /> How Attendance Works
          </h3>
          <ol className="space-y-2.5">
            {[
              'Your registered mobile device is verified when you check in.',
              'Your GPS location is checked to ensure you are at an authorized office.',
              activeMethod === 'qr_code' ? 'Scan the QR code displayed at the office entrance with your registered mobile.' : null,
              'All checks must pass before your attendance is recorded.',
              'Submit your daily log before checking out.',
            ].filter(Boolean).map((text, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>

          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-2 font-medium">Device issues?</p>
            <div className="flex gap-2">
              <button onClick={() => navigate('/device-status')} className="btn-ghost text-xs py-1.5 flex-1">
                View Device Status
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Camera Scanner Overlay for PC QR ── */}
      {showCheckoutScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 text-center shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Scan PC Screen</h3>
            <p className="text-xs text-slate-400 mb-4">Point your camera at the QR code displayed on your PC to complete check-out.</p>
            <CameraQrScanner
              onScan={handleMobileCheckoutScan}
              onCancel={() => setShowCheckoutScanner(false)}
            />
          </div>
        </div>
      )}

      {/* ── Daily Log Modal ── */}
      <DailyLogModal
        isOpen={showDailyLogModal}
        onClose={() => setShowDailyLogModal(false)}
        onSuccess={handleDailyLogSuccess}
        teamName={user?.teamId?.name || ''}
      />

      {/* ── Desktop Checkout QR Modal ── */}
      <CheckoutQrModal
        isOpen={showCheckoutQrModal}
        onClose={() => setShowCheckoutQrModal(false)}
        onSuccess={(data) => {
          setShowCheckoutQrModal(false);
          setReportData(data);
          setShowReportModal(true);
          fetchDashboard();
        }}
        getLocation={getLocation}
      />

      {/* ── Final Attendance Report Modal ── */}
      <AttendanceReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportData={reportData}
        onReportSent={() => {
          fetchDashboard();
        }}
      />
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

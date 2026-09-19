import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { getDeviceFingerprint } from '../lib/fingerprint';
import {
  LogIn, LogOut, Coffee, Timer, FileText, Bell,
  CheckCircle, XCircle, Clock, Wifi, Smartphone, QrCode,
  AlertTriangle, AlertCircle, Loader2, MapPin, Shield,
  ChevronLeft, ChevronRight, Camera, Info, Monitor, X, Lock, Fingerprint,
  Calendar, RefreshCw, BarChart3, Check, Activity
} from 'lucide-react';
import {
  isBiometricSupported,
  getBiometricStatus,
  enrollBiometric,
  authenticateBiometric,
  formatWebAuthnError
} from '../lib/webauthn';
import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'qrcode';
import { useSocket } from '../contexts/SocketContext';
import DailyLogModal from '../components/checkout/DailyLogModal';
import CheckoutQrModal from '../components/checkout/CheckoutQrModal';
import AttendanceReportModal from '../components/checkout/AttendanceReportModal';
import CheckInPermissionsModal, { checkCameraAndLocationPermissions } from '../components/CheckInPermissionsModal';

import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';
import DonutChart from '../components/timechamp/DonutChart';
import alertTune from '../images/alert tune/classic_piano_sms.mp3';

// ── Client-Side Structural QR Validators ─────────────────────────────────────
const isValidOfficeQr = (text) => {
  if (!text || typeof text !== 'string') return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(
      parsed &&
      parsed.type === 'OFFICE_QR' &&
      typeof parsed.officeId === 'string' &&
      typeof parsed.sig === 'string' &&
      parsed.sig.length === 64 &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt) &&
      parsed.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
};

const isValidCheckoutQr = (text) => {
  if (!text || typeof text !== 'string') return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && parsed.type === 'CHECKOUT_QR' && typeof parsed.token === 'string');
  } catch {
    return /^[a-f0-9]{32}$/i.test(text.trim());
  }
};

// ── Headless Single-Target Camera QR Scanner ─────────────────────────────────
// Mounts a focused live camera viewfinder with CSS peripheral dimming vignette,
// responsive capped qrbox (max 280px), continuous in-flight filtering, duplicate-scan guard,
// and throttled non-flickering status feedback.
const CameraQrScanner = ({
  onScan,
  onCancel,
  scannerId = 'qr-office-reader',
  validator = null,
  expectedLabel = 'Office QR',
}) => {
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState(`Align ${expectedLabel} inside the target box`);
  const [isInvalidFeedback, setIsInvalidFeedback] = useState(false);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  const acceptedRef = useRef(false);
  const throttleTimerRef = useRef(null);

  useEffect(() => {
    let html5QrCode = null;
    let isCancelled = false;
    acceptedRef.current = false;

    const startScanner = async () => {
      try {
        const el = document.getElementById(scannerId);
        if (!el || isCancelled) return;

        // Wipe any leftovers from previous attempts
        el.innerHTML = '';

        html5QrCode = new Html5Qrcode(scannerId);
        el.__html5QrCode = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' }, // prefer rear camera
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const edgeSize = Math.min(280, Math.floor(minEdge * 0.7));
              return { width: edgeSize, height: edgeSize };
            },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            if (isCancelled || acceptedRef.current) return;

            // 1. Client-side structural filter
            const validateFn = validatorRef.current;
            if (validateFn && !validateFn(decodedText)) {
              // Non-matching barcode/QR detected — DO NOT STOP! Keep scanning.
              // Throttle status notice to avoid UI flickering
              if (!throttleTimerRef.current) {
                setIsInvalidFeedback(true);
                setStatusMsg(`Not an ${expectedLabel} — please align the ${expectedLabel} inside the box`);
                throttleTimerRef.current = setTimeout(() => {
                  if (!acceptedRef.current && !isCancelled) {
                    setIsInvalidFeedback(false);
                    setStatusMsg(`Align ${expectedLabel} inside the target box`);
                  }
                  throttleTimerRef.current = null;
                }, 1500);
              }
              return;
            }

            // 2. Valid QR detected — atomic lock
            acceptedRef.current = true;
            setScanSuccess(true);
            setIsInvalidFeedback(false);
            setStatusMsg(`✓ ${expectedLabel} Verified! Processing...`);

            // 3. Safe lifecycle shutdown
            try {
              if (html5QrCode) {
                const state = typeof html5QrCode.getState === 'function' ? html5QrCode.getState() : 2;
                if (state === 2 || state === 3) {
                  await html5QrCode.stop().catch(() => {});
                }
              }
            } catch (err) {
              console.warn('Scanner stop error:', err);
            }

            // 4. Trigger attendance processing
            onScanRef.current?.(decodedText);
          },
          () => {} // Suppress per-frame miss logs
        );

        if (isCancelled) {
          try {
            if (html5QrCode) {
              const state = typeof html5QrCode.getState === 'function' ? html5QrCode.getState() : 2;
              if (state === 2 || state === 3) {
                await html5QrCode.stop().catch(() => {});
              }
            }
          } catch {}
          return;
        }

        setStarting(false);
      } catch (err) {
        if (isCancelled) return;
        console.error('Camera start error:', err);
        setStarting(false);
        setCameraError(err.message || 'Unable to start camera viewfinder.');
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
      const el = document.getElementById(scannerId);
      const instance = el?.__html5QrCode || html5QrCode;
      if (instance) {
        try {
          const state = typeof instance.getState === 'function' ? instance.getState() : 2;
          if (state === 2 || state === 3) {
            instance.stop().catch(() => {});
          }
        } catch {}
      }
    };
  }, [scannerId, expectedLabel]);

  return (
    <div className="relative flex flex-col items-center">
      {/* Scoped CSS for responsive single-target camera view */}
      <style>{`
        #${scannerId} {
          position: relative !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          border-radius: 1.25rem !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: #000000 !important;
        }
        #${scannerId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 1.25rem !important;
          display: block !important;
        }
        #${scannerId} canvas {
          display: none !important;
        }
        #${scannerId} img {
          display: none !important;
        }
        #${scannerId} #qr-shaded-region {
          display: none !important; /* Replaced with custom CSS vignette */
        }
        @keyframes qrScanLaser {
          0% { top: 16%; opacity: 0.85; }
          50% { top: 82%; opacity: 1; }
          100% { top: 16%; opacity: 0.85; }
        }
        .qr-laser-beam {
          animation: qrScanLaser 2.2s ease-in-out infinite;
        }
      `}</style>

      {/* Frame Container - square container */}
      <div className="relative w-full max-w-[280px] sm:max-w-[300px] aspect-square rounded-2xl overflow-hidden border border-slate-700/80 bg-black shadow-2xl">
        {/* Loading Overlay */}
        {starting && !cameraError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xs text-center p-4">
            <Loader2 size={36} className="animate-spin text-primary-400 mb-3" />
            <p className="text-white font-semibold text-sm">Starting Camera...</p>
            <p className="text-slate-400 text-xs mt-1">Opening rear camera viewfinder</p>
          </div>
        )}

        {/* Live Camera Viewfinder Target */}
        <div id={scannerId} className="w-full h-full" />

        {/* CSS Masking Overlay: Visually dims peripheral area (e.g. secondary monitor/cables) while keeping central target clear */}
        {!starting && !cameraError && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            {/* Central focused scanning cutout with box-shadow dimming the periphery */}
            <div
              className={`relative w-[68%] aspect-square rounded-2xl transition-all duration-300 ${
                scanSuccess
                  ? 'border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65),0_0_25px_rgba(52,211,153,0.8)]'
                  : isInvalidFeedback
                  ? 'border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65),0_0_20px_rgba(251,191,36,0.6)]'
                  : 'border-2 border-primary-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]'
              }`}
            >
              {/* Prominent High-Contrast Corner Brackets */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-white rounded-tl-lg pointer-events-none" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-white rounded-tr-lg pointer-events-none" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-white rounded-bl-lg pointer-events-none" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-white rounded-br-lg pointer-events-none" />

              {/* Animated Laser Scan Beam */}
              {!scanSuccess && (
                <div className="qr-laser-beam absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent shadow-[0_0_12px_rgba(56,189,248,0.9)] pointer-events-none" />
              )}

              {/* Success Checkmark Indicator */}
              {scanSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/40 backdrop-blur-[2px] animate-in zoom-in-75 duration-200">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]">
                    <CheckCircle size={28} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Throttled Status Pill Badge */}
      {!cameraError && (
        <div
          className={`mt-3 px-3 py-1.5 rounded-full text-xs font-medium max-w-[280px] sm:max-w-[300px] text-center border transition-all duration-200 flex items-center justify-center gap-1.5 ${
            scanSuccess
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
              : isInvalidFeedback
              ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse'
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}
        >
          {scanSuccess ? (
            <>
              <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
              <span className="truncate">{statusMsg}</span>
            </>
          ) : isInvalidFeedback ? (
            <>
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
              <span className="leading-tight text-[11px]">{statusMsg}</span>
            </>
          ) : (
            <>
              <QrCode size={14} className="text-sky-600 flex-shrink-0" />
              <span className="truncate text-[11px]">{statusMsg}</span>
            </>
          )}
        </div>
      )}

      {cameraError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center my-3 w-full max-w-[280px]">
          <AlertCircle size={24} className="text-rose-600 mx-auto mb-1.5" />
          <p className="text-rose-900 font-semibold text-xs">Camera Error</p>
          <p className="text-rose-700 text-[11px] mt-0.5 mb-2">{cameraError}</p>
          <button onClick={onCancel} className="btn-ghost text-xs py-1.5 px-3 w-full">
            Close
          </button>
        </div>
      )}

      {!cameraError && (
        <button
          onClick={onCancel}
          className="btn-ghost w-full max-w-[280px] mt-3 text-xs py-2.5 flex items-center justify-center gap-1.5 text-slate-700 hover:text-slate-900"
        >
          <X size={15} /> Cancel Scanning
        </button>
      )}
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

// ── Live Calculation Helper ──────────────────────────────────────────────────
export const calculateLiveWorkMetrics = (checkInTime, checkOutTime, breaks = [], activeBreak = null) => {
  if (!checkInTime) {
    return {
      totalElapsedMs: 0,
      breakMs: 0,
      workMs: 0,
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
    };
  }
  
  const checkInDate = new Date(checkInTime);
  if (isNaN(checkInDate.getTime())) {
    return {
      totalElapsedMs: 0,
      breakMs: 0,
      workMs: 0,
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
    };
  }

  const checkInDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(checkInDate);
  
  const shiftEndLimit = new Date(`${checkInDateStr}T18:00:00.000+05:30`).getTime();
  const now = Date.now();
  
  let endTime = checkOutTime ? new Date(checkOutTime).getTime() : now;
  if (endTime > shiftEndLimit) {
    endTime = shiftEndLimit;
  }
  const checkInMs = checkInDate.getTime();
  if (endTime < checkInMs) {
    endTime = checkInMs;
  }
  
  const totalElapsedMs = Math.max(0, endTime - checkInMs);
  
  // Collect all non-working break intervals within [checkInMs, endTime]
  const rawIntervals = [];
  
  if (Array.isArray(breaks)) {
    for (const b of breaks) {
      if (b && b.startedAt) {
        const bStart = new Date(b.startedAt).getTime();
        const bEnd = b.endedAt ? new Date(b.endedAt).getTime() : endTime;
        const cStart = Math.max(checkInMs, bStart);
        const cEnd = Math.min(endTime, bEnd);
        if (cEnd > cStart) {
          rawIntervals.push({ start: cStart, end: cEnd });
        }
      }
    }
  }
  
  if (activeBreak && activeBreak.startedAt) {
    const bStart = new Date(activeBreak.startedAt).getTime();
    const cStart = Math.max(checkInMs, bStart);
    const cEnd = Math.min(endTime, now);
    if (cEnd > cStart) {
      rawIntervals.push({ start: cStart, end: cEnd });
    }
  }
  
  // Automatic Lunch Break Deduction (1:00 PM to 2:00 PM IST)
  const lunchStart = new Date(`${checkInDateStr}T13:00:00.000+05:30`).getTime();
  const lunchEnd = new Date(`${checkInDateStr}T14:00:00.000+05:30`).getTime();
  const lStart = Math.max(checkInMs, lunchStart);
  const lEnd = Math.min(endTime, lunchEnd);
  if (lEnd > lStart) {
    rawIntervals.push({ start: lStart, end: lEnd });
  }

  // Interval Union: Merge overlapping / adjacent intervals
  let breakMs = 0;
  if (rawIntervals.length > 0) {
    rawIntervals.sort((a, b) => a.start - b.start);
    const merged = [rawIntervals[0]];
    for (let i = 1; i < rawIntervals.length; i++) {
      const cur = rawIntervals[i];
      const prev = merged[merged.length - 1];
      if (cur.start <= prev.end) {
        prev.end = Math.max(prev.end, cur.end);
      } else {
        merged.push(cur);
      }
    }
    for (const interval of merged) {
      breakMs += (interval.end - interval.start);
    }
  }
  
  const workMs = Math.max(0, totalElapsedMs - breakMs);
  const totalDurationMinutes = Math.floor(totalElapsedMs / 60000);
  const totalBreakMinutes = Math.floor(breakMs / 60000);
  const actualWorkMinutes = Math.floor(workMs / 60000);

  return {
    totalElapsedMs,
    breakMs,
    workMs,
    totalDurationMinutes,
    totalBreakMinutes,
    actualWorkMinutes,
  };
};

const calculateLiveWorkMs = (checkInTime, checkOutTime, breaks, activeBreak) => {
  return calculateLiveWorkMetrics(checkInTime, checkOutTime, breaks, activeBreak).workMs;
};

// ── Main Work Timer Component (Continuous net focus time minus breaks) ─────────
const MainWorkTimer = ({ checkInTime, checkOutTime, breaks = [], activeBreak = null }) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) return;
    const calc = () => Math.floor(calculateLiveWorkMs(checkInTime, checkOutTime, breaks, activeBreak) / 1000);

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime, breaks, activeBreak]);

  return (
    <div className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-wider">
      {formatTimerSeconds(netSeconds)}
    </div>
  );
};

// ── Compact Live Work Timer for KPI Tile ─────────────────────────────────────
const MainWorkTimerKpi = ({ checkInTime, checkOutTime, breaks = [], activeBreak = null }) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) return;
    const calc = () => Math.floor(calculateLiveWorkMs(checkInTime, checkOutTime, breaks, activeBreak) / 1000);

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime, breaks, activeBreak]);

  if (!checkInTime) return <span>--:--:--</span>;
  const hours = Math.floor(netSeconds / 3600);
  const minutes = Math.floor((netSeconds % 3600) / 60);
  const seconds = netSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return <span>{pad(hours)}:{pad(minutes)}:{pad(seconds)}</span>;
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
    <div className="font-mono text-3xl font-extrabold text-amber-700 tracking-wider">
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
      {/* Completion Header — gradient banner */}
      <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.55)]">
        <div className="relative rounded-[calc(1.5rem-3px)] bg-gradient-to-br from-emerald-50/95 via-teal-50/90 to-white/90 px-5 py-6 text-center">
          <div aria-hidden="true" className="pointer-events-none absolute -top-14 -right-14 w-48 h-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center mx-auto mb-2.5 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.7)]">
              <CheckCircle size={26} />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Daily Attendance Report</h3>
            <p className="text-slate-500 text-xs mt-0.5">Shift completed for today</p>
            <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-white/90 text-slate-600 text-xs shadow-[0_4px_12px_-6px_rgba(15,23,42,0.3)]">
              <Clock size={12} className="text-violet-500" />
              <span>{checkIn ? checkIn.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
              <span className="text-slate-300">·</span>
              <StatusBadge status={attendance?.status || 'present'} />
            </div>
          </div>
        </div>
      </div>

      {/* 3 Metrics Cards — floating pastel tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] text-center">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 flex items-center justify-center mx-auto mb-1.5 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]">
            <Clock size={15} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Total Duration</p>
          <p className="text-sm sm:text-base font-bold text-slate-800 mt-0.5">{formatDuration(totalDurationMins)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gross Shift</p>
        </div>

        <div className="p-3.5 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] text-center">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-1.5 shadow-[0_4px_10px_-3px_rgba(245,158,11,0.4)]">
            <Coffee size={15} />
          </div>
          <p className="text-[11px] text-amber-500/90 font-medium">Total Breaks</p>
          <p className="text-sm sm:text-base font-bold text-amber-600 mt-0.5">{formatDuration(totalBreakMins)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{breaks.length} break{breaks.length === 1 ? '' : 's'}</p>
        </div>

        <div className="p-3.5 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] text-center">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-1.5 shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]">
            <Timer size={15} />
          </div>
          <p className="text-[11px] text-emerald-500/90 font-medium">Actual Work</p>
          <p className="text-sm sm:text-base font-extrabold text-emerald-600 mt-0.5">{formatDuration(actualWorkMins)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Net Productive</p>
        </div>
      </div>

      {/* Check-In / Check-Out Times — soft inset well */}
      <div className="p-3.5 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 flex items-center gap-1.5">
            <LogIn size={13} className="text-emerald-500" /> Check-in Time:
          </span>
          <span className="font-semibold text-slate-800">{formatTime(checkIn)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-violet-50 pt-2">
          <span className="text-slate-500 flex items-center gap-1.5">
            <LogOut size={13} className="text-rose-500" /> Check-out Time:
          </span>
          <span className="font-semibold text-slate-800">{formatTime(checkOut)}</span>
        </div>
      </div>

      {/* Break History Breakdown */}
      <div className="p-4 rounded-3xl bg-white/80 border border-white/90 shadow-[0_10px_26px_-12px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coffee size={15} className="text-amber-500" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Break Breakdown</span>
          </div>
          <span className="text-xs text-amber-600 font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-50">
            {formatDuration(totalBreakMins)}
          </span>
        </div>

        {breaks.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3 bg-white/70 rounded-2xl border border-violet-50">
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
                <div key={b._id || idx} className="flex items-center justify-between p-2.5 bg-white/80 rounded-2xl text-xs border border-violet-50 shadow-[0_2px_8px_-4px_rgba(148,163,184,0.4)]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 text-amber-500 font-bold flex items-center justify-center text-[10px]">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{typeLabel} Break</p>
                      <p className="text-[11px] text-slate-400">
                        {formatTime(bStart)} – {formatTime(bEnd)}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold font-mono text-xs">
                    {durationMins}m
                  </span>
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
  const [geoStatus, setGeoStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const getLocation = useCallback((silent = false) => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported.'));
      return;
    }
    
    if (!silent) {
      setLoading(true);
      setGeoError(null);
      setGeoStatus('Getting precise location...');
    }

    const readings = [];
    let finished = false;
    let watchId;
    let timeoutId;

    const finish = (locationError = null) => {
      if (finished) return;
      finished = true;

      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);

      if (!silent) {
        setLoading(false);
        setGeoStatus(null);
      }

      if (locationError) {
        if (!silent) setGeoError(locationError.message || 'Unable to get location');
        reject(locationError);
        return;
      }

      if (readings.length === 0) {
        const msg = 'Unable to obtain a valid GPS location. Please ensure you are outdoors or near a window.';
        setGeoError(msg);
        reject(new Error(msg));
        return;
      }

      // Sort by best accuracy
      readings.sort((a, b) => a.accuracy - b.accuracy);
      resolve(readings[0]);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (finished) return;

        const { latitude, longitude, accuracy } = pos.coords;

        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Number.isFinite(accuracy) &&
          accuracy <= 100 // Ignore wildly inaccurate readings
        ) {
          readings.push({
            lat: latitude,
            lng: longitude,
            accuracy,
            timestamp: pos.timestamp || Date.now()
          });

          setGeoStatus(`Improving accuracy... (${readings.length}/5)`);

          // Fast-track for excellent accuracy
          if (accuracy <= 20) {
            finish();
            return;
          }

          // Stop collecting after 5 valid readings
          if (readings.length >= 5) {
            finish();
            return;
          }
        }
      },
      (err) => {
        if (finished) return;
        const msg = err.code === 1
          ? 'Location Access Required — please allow location access to verify your work location.'
          : 'Unable to get your location. Please try again.';
        finish(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );

    // Safety timeout to ensure we always resolve
    timeoutId = setTimeout(() => {
      if (!finished) {
        finish();
      }
    }, 15000);

  }), []);

  return { geoError, geoStatus, loading, getLocation };
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
    active:    { dot: 'bg-emerald-400', color: 'text-emerald-500', desc: 'This device is registered and authorized for attendance.' },
    temporary: { dot: 'bg-amber-400',   color: 'text-amber-500',   desc: `Temporary access expires ${device?.temporaryUntil ? new Date(device.temporaryUntil).toLocaleDateString('en-IN') : 'soon'}.` },
    pending:   { dot: 'bg-sky-400',    color: 'text-sky-500',    desc: 'Your registration is awaiting admin approval.' },
    registered_other_device: { dot: 'bg-rose-400', color: 'text-rose-500', desc: 'You already have another device registered. Request a replacement to use this one.' },
    pending_other_device: { dot: 'bg-amber-400', color: 'text-amber-500', desc: 'You have a pending registration on another device.' },
    none:      { dot: 'bg-rose-400',     color: 'text-rose-500',     desc: 'This specific browser is not registered. Register it to mark attendance.' },
  }[statusType] || {};

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(148,163,184,0.4)]">
            <Smartphone size={15} />
          </div>
          <span className="text-sm font-bold text-slate-800">Attendance Device</span>
        </div>
        <button onClick={() => navigate('/device-status')} className="text-xs text-violet-500 hover:text-violet-600 font-semibold transition-colors flex items-center gap-1">
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
  if (msg.includes('unauthorized network') || msg.includes('outside office location') || msg.includes('gps accuracy')) {
    return rawMessage;
  }
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

// ── Web Audio Synthesized Buzzer ───────────────────────────────────────────────
const playLoudBuzzer = () => {
  // We will now use the custom audio file instead of the synthesizer
};

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getLocation, geoError, geoStatus, loading: geoLoading } = useGeolocation();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [officeQrDataUrl, setOfficeQrDataUrl] = useState('');

  // Continuous Presence Monitoring States
  const [warningCountState, setWarningCountState] = useState(0);
  const warningCountRef = useRef(0);
  const warningCount = warningCountState;
  const setWarningCount = (val) => { warningCountRef.current = val; setWarningCountState(val); };

  const [consecutiveOutTicksState, setConsecutiveOutTicksState] = useState(0);
  const consecutiveOutTicksRef = useRef(0);
  const consecutiveOutTicks = consecutiveOutTicksState;
  const setConsecutiveOutTicks = (val) => { consecutiveOutTicksRef.current = val; setConsecutiveOutTicksState(val); };

  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [outOfBoundsReason, setOutOfBoundsReason] = useState('');
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  const [currentDistance, setCurrentDistance] = useState(null);
  const [officeRadius, setOfficeRadius] = useState(null);
  
  const buzzerAudio = useRef(new Audio(alertTune));

  const { socket } = useSocket();
  const [showDailyLogModal, setShowDailyLogModal] = useState(false);
  const [showCheckoutQrModal, setShowCheckoutQrModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCheckoutScanner, setShowCheckoutScanner] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [todayDailyLog, setTodayDailyLog] = useState(null);
  const [showPermissionsGate, setShowPermissionsGate] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(false);

  // Flexible Attendance Method & Fallback States
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [fallbackHistory, setFallbackHistory] = useState([]);
  const [methodAttempts, setMethodAttempts] = useState([]);
  const [fallbackBanner, setFallbackBanner] = useState(null);

  const managerDefaultMethod = dashboard?.managerDefaultMethod || dashboard?.activeMethod || 'qr_code';
  const allowedMethods = useMemo(() => {
    const list = dashboard?.allowedMethods || ['biometric', 'wifi_ip', 'qr_code'];
    return Array.isArray(list) && list.length > 0 ? list : ['biometric', 'wifi_ip', 'qr_code'];
  }, [dashboard?.allowedMethods]);
  const activeMethod = selectedMethod || managerDefaultMethod;

  // TimeChamp view & date states
  const [activeTab, setActiveTab] = useState('overview');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Day');
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(5);

  const fetchHistory = useCallback(() => {
    api.get('/employee/attendance/me')
      .then(res => setHistory(res.data?.data?.attendance || []))
      .catch(() => {});
  }, []);

  const showMessage = useCallback((type, text, meta = null) => {
    setMessage({ type, text, meta });
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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Real-time listener for Session Reactivation decisions & Heartbeat Setting updates
  useEffect(() => {
    if (!socket) return;
    const handleReactivated = () => {
      setShowWarningModal(false);
      fetchDashboard();
      showMessage('presence_success', '🎉 Your attendance session has been approved and reactivated by management! Resuming live tracking.', { isPresence: true });
    };
    const handleReactivationRejected = (data) => {
      setShowWarningModal(false);
      fetchDashboard();
      showMessage('error', data?.reason ? `Session reactivation rejected: ${data.reason}` : 'Session reactivation rejected by management. Attendance is closed for today.');
    };
    const handleSettingUpdated = (data) => {
      // Immediately apply the change from the socket payload (zero-latency optimistic update)
      if (data && typeof data.heartbeatMonitoringEnabled === 'boolean') {
        setDashboard(prev => prev ? {
          ...prev,
          heartbeatMonitoringEnabled: data.heartbeatMonitoringEnabled,
          activeMethod: data.activeMethod || prev.activeMethod,
          managerDefaultMethod: data.activeMethod || prev.managerDefaultMethod,
        } : prev);

        // Show a friendly notification banner
        const status = data.heartbeatMonitoringEnabled ? 'ON' : 'OFF';
        const emoji = data.heartbeatMonitoringEnabled ? '🟢' : '🔴';
        showMessage(
          data.heartbeatMonitoringEnabled ? 'info' : 'warning',
          `${emoji} Workstation heartbeat monitoring has been turned ${status} by management.`
        );
      }

      // Background sync to ensure full dashboard state is consistent
      fetchDashboard();
    };
    const handleHeartbeatWarning = (data) => {
      showMessage('warning', `⚠️ Workstation heartbeat signal lost for ${data.minutesMissing || 4} minutes. Keep this tab open to avoid automatic closure (${data.timeoutMinutes || 8}m timeout).`);
    };

    socket.on('attendance:reactivated', handleReactivated);
    socket.on('attendance:reactivation_rejected', handleReactivationRejected);
    socket.on('attendance-setting:updated', handleSettingUpdated);
    socket.on('attendance:heartbeat_warning', handleHeartbeatWarning);

    return () => {
      socket.off('attendance:reactivated', handleReactivated);
      socket.off('attendance:reactivation_rejected', handleReactivationRejected);
      socket.off('attendance-setting:updated', handleSettingUpdated);
      socket.off('attendance:heartbeat_warning', handleHeartbeatWarning);
    };
  }, [socket, fetchDashboard, showMessage]);

  // Polling fallback while reactivation is pending review
  useEffect(() => {
    const isPending = dashboard?.attendance?.attendance?.reactivationStatus === 'pending';
    if (!isPending) return;
    const pollInterval = setInterval(() => {
      fetchDashboard();
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [dashboard?.attendance?.attendance?.reactivationStatus, fetchDashboard]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  useEffect(() => {
    isBiometricSupported().then(setBiometricSupported).catch(() => setBiometricSupported(false));
  }, []);

  const fetchNetworkStatus = useCallback(async () => {
    setNetworkLoading(true);
    try {
      const res = await api.get('/employee/network-status');
      setNetworkStatus(res.data?.data || null);
    } catch {
      // Ignore network status fetch errors
    } finally {
      setNetworkLoading(false);
    }
  }, []);

  const fetchBiometricStatus = useCallback(async () => {
    try {
      const status = await getBiometricStatus();
      setBiometricStatus(status);
    } catch {
      // ignore
    }
  }, []);

  // Synchronize network and biometric statuses with active method
  useEffect(() => {
    if (activeMethod === 'wifi_ip') {
      fetchNetworkStatus();
    }
  }, [activeMethod, fetchNetworkStatus]);

  useEffect(() => {
    if (activeMethod === 'biometric') {
      fetchBiometricStatus();
    }
  }, [activeMethod, fetchBiometricStatus]);

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

  // ── Comprehensive real-time sync: all manager/admin actions that affect this employee ──
  useEffect(() => {
    if (!socket) return;

    // Fired by manager manual-attendance approval, checkin/checkout broadcasts
    const onAttendanceUpdate = () => {
      fetchDashboard();
    };

    // Fired when manager approves/rejects manual attendance request
    const onNotificationNew = (data) => {
      fetchDashboard();
      if (data?.title) {
        const isApproved = data.title.toLowerCase().includes('approved');
        showMessage(
          isApproved ? 'success' : 'warning',
          `📋 ${data.title}${data.message ? ` — ${data.message}` : ''}`
        );
      }
    };

    // Fired when admin/manager approves or rejects a leave request
    const onLeaveResolved = (data) => {
      fetchDashboard();
      const action = data?.status === 'approved' ? 'approved ✅' : 'rejected ❌';
      showMessage(
        data?.status === 'approved' ? 'success' : 'warning',
        `🗓️ Your leave request has been ${action}${data?.decisionNote ? ` — ${data.decisionNote}` : ''}.`
      );
    };

    // Fired when manager approves or rejects an office-location override request
    const onLocationResolved = (data) => {
      fetchDashboard();
      const isApproved = data?.action === 'approve';
      showMessage(
        isApproved ? 'success' : 'warning',
        `📍 Your location request has been ${isApproved ? 'approved ✅' : 'rejected ❌'}.`
      );
    };

    socket.on('attendance:update',         onAttendanceUpdate);
    socket.on('notification:new',          onNotificationNew);
    socket.on('leave:request_resolved',    onLeaveResolved);
    socket.on('location:request_resolved', onLocationResolved);

    return () => {
      socket.off('attendance:update',         onAttendanceUpdate);
      socket.off('notification:new',          onNotificationNew);
      socket.off('leave:request_resolved',    onLeaveResolved);
      socket.off('location:request_resolved', onLocationResolved);
    };
  }, [socket, fetchDashboard, showMessage]);


  // Fetch QR Code for Desktop Display
  useEffect(() => {
    if (!isMobileDevice() && activeMethod === 'qr_code') {
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
  }, [activeMethod]);

  // Fetch on mount, every 30s, and on tab focus
  useEffect(() => {
    fetchDashboard();
    fetchBiometricStatus();
    fetchNetworkStatus();
    const intervalId = setInterval(() => {
      fetchDashboard();
      fetchBiometricStatus();
      fetchNetworkStatus();
    }, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboard();
        fetchBiometricStatus();
        fetchNetworkStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchDashboard, fetchBiometricStatus, fetchNetworkStatus]);

  // Redirect mobile with no device to onboarding
  useEffect(() => {
    if (dashboard?.deviceStatus?.statusType === 'none') {
      const hasPending = dashboard?.deviceStatus?.device?.status === 'PENDING';
      if (!hasPending && isMobileDevice()) {
        navigate('/device-onboarding');
      }
    }
  }, [dashboard, navigate]);


  const handleStartScanClick = async () => {
    try {
      const { camera, location } = await checkCameraAndLocationPermissions();
      if (camera === 'granted' && location === 'granted') {
        setShowScanner(true);
        return;
      }
    } catch {}
    setShowPermissionsGate(true);
  };

  const handlePermissionsGranted = () => {
    setShowPermissionsGate(false);
    setShowScanner(true);
  };

  const handleManualSwitchMethod = (method) => {
    setSelectedMethod(method);
    setFallbackBanner(null);
    if (method === 'wifi_ip') fetchNetworkStatus();
    if (method === 'biometric') fetchBiometricStatus();
  };

  const handleCheckIn = async (scannedQrValue = null, extraPayload = {}, methodOverride = null) => {
    const finalQrValue = typeof scannedQrValue === 'string' ? scannedQrValue : null;
    const currentMethod = methodOverride || activeMethod;
    setActionLoading('checkin');
    setShowScanner(false);
    try {
      if (currentMethod === 'qr_code' && !finalQrValue) {
        throw new Error('Please scan the office QR code to check in.');
      }
      const loc = await getLocation();
      const fp = await getDeviceFingerprint();
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        timestamp: loc.timestamp || Date.now(),
        deviceFingerprint: fp,
        checkInMethod: currentMethod,
        methodAttempts,
        ...extraPayload,
      };
      if (currentMethod === 'qr_code') payload.qrCodeValue = finalQrValue;

      await api.post('/employee/attendance/check-in', payload);
      showMessage('success', '✅ Attendance Marked Successfully! You are checked in.');
      setFallbackBanner(null);
      setMethodAttempts([]);
      fetchDashboard();
      fetchBiometricStatus();
      fetchNetworkStatus();
    } catch (err) {
      const status = err.response?.status;
      const raw = err.response?.data?.message || err.message || 'Check-in failed.';
      const formattedMsg = formatAttendanceError(raw);

      // System errors (HTTP 500, DB unavailable, timeout) DO NOT trigger fallback!
      const isSystemError = status >= 500 || (!err.response && err.request);
      if (isSystemError) {
        showMessage('error', formattedMsg);
        return;
      }

      // Verification failures trigger strict one-way cascade: Biometric -> WiFi -> QR
      if (currentMethod === 'wifi_ip') {
        const updatedAttempts = [
          ...methodAttempts,
          { method: 'wifi_ip', status: 'failed', reason: raw, timestamp: new Date().toISOString() }
        ];
        setMethodAttempts(updatedAttempts);

        // Strict cascade: wifi_ip -> qr_code
        if (!fallbackHistory.includes('qr_code') && allowedMethods.includes('qr_code')) {
          setFallbackHistory((prev) => [...prev, 'wifi_ip']);
          setSelectedMethod('qr_code');
          setFallbackBanner("⚠️ Office WiFi verification failed. We've automatically switched you to Office QR Code.");
        } else {
          showMessage('error', formattedMsg);
        }
      } else if (currentMethod === 'biometric') {
        const updatedAttempts = [
          ...methodAttempts,
          { method: 'biometric', status: 'failed', reason: raw, timestamp: new Date().toISOString() }
        ];
        setMethodAttempts(updatedAttempts);

        if (!fallbackHistory.includes('wifi_ip') && allowedMethods.includes('wifi_ip')) {
          setFallbackHistory((prev) => [...prev, 'biometric']);
          setSelectedMethod('wifi_ip');
          setFallbackBanner("⚠️ Biometric check-in failed. We've automatically switched you to Office WiFi. (You can also choose Office QR).");
        } else if (!fallbackHistory.includes('qr_code') && allowedMethods.includes('qr_code')) {
          setFallbackHistory((prev) => [...prev, 'biometric', 'wifi_ip']);
          setSelectedMethod('qr_code');
          setFallbackBanner("⚠️ Biometric check-in failed. We've automatically switched you to Office QR Code.");
        } else {
          showMessage('error', formattedMsg);
        }
      } else {
        // QR Code is the terminal fallback: STOP, never loop back
        showMessage('error', formattedMsg);
      }
    } finally {
      setActionLoading('');
    }
  };

  const handleEnrollBiometric = async () => {
    setActionLoading('biometric-enroll');
    try {
      await enrollBiometric();
      showMessage('success', '✅ Biometric authentication enabled successfully on this device!');
      fetchBiometricStatus();
    } catch (err) {
      if (err.name === 'InvalidStateError' || (err.message || '').toLowerCase().includes('already registered')) {
        showMessage('success', '✅ Biometric is already registered on this device. You can now verify and check in.');
        fetchBiometricStatus();
        return;
      }
      showMessage('error', formatWebAuthnError(err));
    } finally {
      setActionLoading('');
    }
  };

  const handleBiometricCheckIn = async () => {
    setActionLoading('biometric-checkin');
    try {
      const { biometricToken } = await authenticateBiometric();
      await handleCheckIn(null, { biometricToken }, 'biometric');
    } catch (err) {
      setActionLoading('');
      const status = err.response?.status;
      const isSystemError = status >= 500 || (!err.response && err.request);
      if (isSystemError) {
        showMessage('error', formatWebAuthnError(err));
        return;
      }

      const raw = formatWebAuthnError(err);
      const updatedAttempts = [
        ...methodAttempts,
        { method: 'biometric', status: 'failed', reason: err.name || 'AUTH_CANCELLED', timestamp: new Date().toISOString() }
      ];
      setMethodAttempts(updatedAttempts);

      // Biometric failure -> switch to WiFi
      if (!fallbackHistory.includes('wifi_ip') && allowedMethods.includes('wifi_ip')) {
        setFallbackHistory((prev) => [...prev, 'biometric']);
        setSelectedMethod('wifi_ip');
        setFallbackBanner("⚠️ Biometric verification failed or was cancelled. We've automatically switched you to Office WiFi. (You can also choose Office QR).");
      } else if (!fallbackHistory.includes('qr_code') && allowedMethods.includes('qr_code')) {
        setFallbackHistory((prev) => [...prev, 'biometric', 'wifi_ip']);
        setSelectedMethod('qr_code');
        setFallbackBanner("⚠️ Biometric verification failed. We've automatically switched you to Office QR Code.");
      } else {
        showMessage('error', raw);
      }
    }
  };

  const handleCheckOutClick = () => {
    const isLogSubmitted = Boolean(dashboard?.dailyLogSubmitted || todayDailyLog);

    if (!isLogSubmitted) {
      showMessage('error', '⚠️ Log sheet is mandatory before check-out. Please submit your daily log sheet first.');
      navigate('/daily-log');
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
    setDashboard((prev) => prev ? { ...prev, dailyLogSubmitted: true } : prev);
    setShowDailyLogModal(false);
    showMessage('success', '✅ Daily Log Sheet submitted! Check-out is now unlocked.');
    fetchDashboard();
  };

  const executeCheckout = async (extraPayload = {}) => {
    setActionLoading('checkout');
    try {
      const loc = await getLocation();
      const fp = await getDeviceFingerprint();
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        timestamp: loc.timestamp || Date.now(),
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

  const handleAutoCheckout = useCallback(async () => {
    try {
      await api.post('/employee/attendance/check-out', { autoCheckOut: true, autoCheckoutReason: 'PRESENCE_VALIDATION_FAILED' });
      setDashboard(prev => {
        if (!prev) return prev;
        return { 
          ...prev, 
          attendance: { 
            ...prev.attendance, 
            attendance: {
              ...prev.attendance.attendance,
              checkOutTime: new Date().toISOString(),
              status: 'incomplete'
            }
          }
        };
      });
      setShowWarningModal(true);
      setGracePeriodSeconds(0);
      fetchDashboard();
    } catch(e) {
      console.error('Auto checkout failed:', e);
    }
  }, [fetchDashboard]);

  const handleSubmitOutOfBoundsReason = async () => {
    if (!outOfBoundsReason || !outOfBoundsReason.trim()) {
      showMessage('error', 'Please enter a valid reason.');
      return;
    }
    setReasonSubmitting(true);
    try {
      await api.post('/employee/presence/reason', { reason: outOfBoundsReason });
      setShowWarningModal(false);
      setOutOfBoundsReason('');
      showMessage('success', 'Reason submitted. Please upload your daily work log before 8:00 PM.');
      setActiveTab('log');
      fetchDashboard();
    } catch (e) {
      console.error(e);
      showMessage('error', 'Failed to submit reason.');
    } finally {
      setReasonSubmitting(false);
    }
  };

  const handleBreakStart = async (breakType) => {
    if (isLogSheetLocked) {
      showMessage('error', '⚠️ Break controls are locked after 8:00 PM.');
      return;
    }
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

  const att = dashboard?.attendance;
  const todayAtt = att?.attendance || null;
  const isCheckedIn = !!(todayAtt?.checkInTime);
  const isCheckedOut = !!(todayAtt?.checkOutTime);
  const hasActiveBreak = !!(att?.activeBreak);
  const isLogSubmitted = Boolean(dashboard?.dailyLogSubmitted || todayDailyLog);
  const dailyLogMissing = isCheckedIn && !isCheckedOut && !isLogSubmitted;
  const deviceStatus = dashboard?.deviceStatus;
  // Derived from dashboard so React tracks changes when manager toggles heartbeat
  const heartbeatMonitoringEnabled = dashboard?.heartbeatMonitoringEnabled === true;

  // Live tick so the Workday Breakdown stays in sync with the live hero timer
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!isCheckedIn) return;
    const t = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, [isCheckedIn]);

  // Continuous Presence Monitoring
  useEffect(() => {
    if (!isCheckedIn || isCheckedOut) return;

    // If manager has disabled heartbeat monitoring, skip continuous intervals and dismiss warnings
    if (!heartbeatMonitoringEnabled) {
      if (warningCount > 0) {
        setWarningCount(0);
        setShowWarningModal(false);
      }
      if (gracePeriodSeconds > 0) setGracePeriodSeconds(0);
      return;
    }

    // Do not track if on break or during lunch (1 PM - 2 PM)
    const isLunchHour = new Date().getHours() === 13;
    if (hasActiveBreak || isLunchHour) {
      if (warningCount > 0) {
        setWarningCount(0);
        setShowWarningModal(false);
      }
      if (gracePeriodSeconds > 0) setGracePeriodSeconds(0);
      return;
    }

    const interval = setInterval(async () => {
      try {
        const loc = await getLocation(true); // silent = true
        const res = await api.post('/employee/presence/ping', {
          currentWarningCount: warningCountRef.current,
          lat: loc.lat,
          lng: loc.lng
        });
        
        const payload = res.data?.data ?? res.data;
        const isOutOfBounds = payload?.isOutOfBounds;
        const distanceMeters = typeof payload?.distanceMeters === 'number' ? Math.round(payload.distanceMeters) : null;
        const radiusMeters = typeof payload?.radiusMeters === 'number' ? Math.round(payload.radiusMeters) : null;

        if (distanceMeters !== null) setCurrentDistance(distanceMeters);
        if (radiusMeters !== null) setOfficeRadius(radiusMeters);

        if (isOutOfBounds) {
          const newTicks = consecutiveOutTicksRef.current + 1;
          setConsecutiveOutTicks(newTicks);
          
          // Ticks happen every 30 seconds.
          // Trigger warnings on ticks: 1 (30s), 3 (1m30s), 5 (2m30s), 7 (3m30s), 9 (4m30s)
          const expectedWarningCount = Math.floor((newTicks + 1) / 2);
          
          if (expectedWarningCount > warningCountRef.current && expectedWarningCount <= 5) {
            setWarningCount(expectedWarningCount);
            setShowWarningModal(true);
            
            // Play custom audio file
            buzzerAudio.current.play().catch(e => console.log('Audio play failed:', e));
            
            // If this is the 5th warning, start the grace period timer immediately
            if (expectedWarningCount === 5) {
              setGracePeriodSeconds(180); // 3 minutes
            }
          }
        } else {
          // Inside office: determine if returning from outside or normal verification
          const wasOutside = warningCountRef.current > 0 || consecutiveOutTicksRef.current > 0;
          const distTag = distanceMeters !== null ? ` (${distanceMeters}m / ${radiusMeters ?? 100}m allowed)` : '';

          if (wasOutside) {
            showMessage('presence_success', `You are back in the office premises. Warning alerts have stopped.`, {
              isPresence: true,
              isReturn: true,
              distance: distanceMeters,
              radius: radiusMeters ?? 100
            });
          } else {
            showMessage('presence_success', `You are safely within the authorized office perimeter.`, {
              isPresence: true,
              isReturn: false,
              distance: distanceMeters,
              radius: radiusMeters ?? 100
            });
          }

          setConsecutiveOutTicks(0);
          setWarningCount(0);
          setGracePeriodSeconds(0);
          setShowWarningModal(false);
        }
      } catch (err) {
        console.error('Ping failed:', err);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isCheckedIn, isCheckedOut, hasActiveBreak, getLocation, heartbeatMonitoringEnabled]);

  useEffect(() => {
    if (gracePeriodSeconds > 0) {
      const timer = setInterval(() => {
        setGracePeriodSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoCheckout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gracePeriodSeconds, handleAutoCheckout]);

  const isLogSheetLocked = useMemo(() => {
    if (!todayAtt?.checkInTime) return false;
    const checkInDate = new Date(todayAtt.checkInTime);
    const checkInDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(checkInDate);
    const limit = new Date(`${checkInDateStr}T20:00:00.000+05:30`).getTime();
    return nowTick > limit;
  }, [todayAtt?.checkInTime, nowTick]);

  const isPastShiftEnd = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const limit = new Date(`${todayStr}T18:00:00.000+05:30`).getTime();
    return nowTick > limit;
  }, [nowTick]);

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

  // Computed metrics for TimeChamp UI
  const totalRemainingLeaves = useMemo(() => {
    if (!dashboard?.leaveBalances?.length) return 0;
    return dashboard.leaveBalances.reduce((acc, b) => acc + Math.max(0, (b.allocated || 0) - (b.used || 0)), 0);
  }, [dashboard?.leaveBalances]);

  const startTimeStr = todayAtt?.checkInTime
    ? new Date(todayAtt.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const lastSeenStr = isCheckedOut
    ? new Date(todayAtt.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : (isCheckedIn ? 'Active Now' : '--:--');

  const completedBreakMins = useMemo(() => {
    if (isCheckedIn && todayAtt?.checkInTime && !isCheckedOut) {
      const metrics = calculateLiveWorkMetrics(
        todayAtt.checkInTime,
        todayAtt.checkOutTime,
        todayAtt.breaks || att?.breaks || [],
        att?.activeBreak
      );
      return metrics.totalBreakMinutes;
    }
    return att?.completedBreakMinutes ?? todayAtt?.completedBreakMinutes ?? todayAtt?.totalBreakMinutes ?? 0;
  }, [isCheckedIn, isCheckedOut, todayAtt, att, nowTick]);

  const breakTimeStr = completedBreakMins > 0 ? formatDuration(completedBreakMins) : '00:00';



  // Live net productive minutes — same clock as the hero timer, minus breaks
  const liveWorkMins = useMemo(() => {
    if (isCheckedIn && todayAtt?.checkInTime) {
      return Math.floor(calculateLiveWorkMs(todayAtt.checkInTime, todayAtt.checkOutTime, todayAtt.breaks || att?.breaks || [], att?.activeBreak) / 60000);
    }
    return todayAtt?.actualWorkMinutes || todayAtt?.totalWorkMinutes || 0;
  }, [isCheckedIn, todayAtt, nowTick, hasActiveBreak, att]);

  const workBreakdownData = useMemo(() => {
    const workMins = liveWorkMins;
    const breakMins = completedBreakMins || 0;
    const targetMins = 8 * 60;
    const remainingMins = Math.max(0, targetMins - workMins - breakMins);

    return [
      { 
        name: 'Productive Work', 
        value: workMins, 
        displayValue: `${Math.floor(workMins / 60)}h ${workMins % 60}m`,
        color: '#0ea5e9' 
      },
      { 
        name: 'Completed Breaks', 
        value: breakMins, 
        displayValue: `${breakMins}m`,
        color: '#f59e0b' 
      },
      { 
        name: 'Remaining Shift', 
        value: remainingMins, 
        displayValue: `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m`,
        color: '#334155' 
      },
    ];
  }, [liveWorkMins, completedBreakMins]);

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return history.slice(start, start + historyPageSize);
  }, [history, historyPage, historyPageSize]);

  const totalHistoryPages = Math.max(1, Math.ceil(history.length / historyPageSize));

  const employeeTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'log', label: 'Daily Work Log', badge: isLogSubmitted ? 'Submitted' : 'Mandatory', badgeClass: isLogSubmitted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300' },
    { id: 'leave', label: 'Leave Balance', badge: `${totalRemainingLeaves} Days`, badgeClass: 'bg-sky-500/20 text-sky-300' },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'log') navigate('/daily-log');
    if (tabId === 'leave') navigate('/leave');
    if (tabId === 'attendance') navigate('/attendance');
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

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      {/* ── Sub-Header & Date Controls ── */}
      <PageHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0]} 👋`}
        subtitle={`Daily presence tracking, shift timers, and compliance verification · ${dashboard?.teamName || 'Spheronix Team'}`}
        tabs={employeeTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        date={currentDate}
        onPrevDate={handlePrevDate}
        onNextDate={handleNextDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        badgeText={`Active Mode: ${activeMethod?.replace('_', ' ').toUpperCase() || 'QR CODE'}`}
        rightActions={
          <button
            onClick={() => {
              fetchDashboard();
              fetchHistory();
            }}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
            title="Refresh statistics"
          >
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* Message Banner */}
      {message && (() => {
        const isPresence = message.type === 'presence_success' || message.meta?.isPresence || (typeof message.text === 'string' && (message.text.includes('Presence verified') || message.text.includes('office premises')));
        
        if (isPresence) {
          const distMatch = typeof message.text === 'string' ? message.text.match(/\((\d+)m\s*\/\s*(\d+)m allowed\)/) : null;
          const displayDist = message.meta?.distance ?? (distMatch ? distMatch[1] : currentDistance);
          const displayRadius = message.meta?.radius ?? (distMatch ? distMatch[2] : (officeRadius ?? 100));
          const isReturn = Boolean(message.meta?.isReturn || (typeof message.text === 'string' && message.text.includes('back in the office')));

          return (
            <div className="relative overflow-hidden rounded-[26px] bg-[#f2faf7] border border-[#a7f3d0] p-4 sm:p-5 shadow-[0_12px_36px_-10px_rgba(16,185,129,0.18),0_0_30px_rgba(167,243,208,0.45)] transition-all duration-300 animate-in slide-in-from-top-3">
              {/* Radar Contour Background in Top-Right */}
              <div className="absolute top-0 right-10 sm:right-16 w-48 h-32 pointer-events-none opacity-40 overflow-hidden select-none">
                <svg viewBox="0 0 160 120" className="w-full h-full" fill="none">
                  <circle cx="125" cy="35" r="16" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="125" cy="35" r="30" stroke="#10b981" strokeWidth="1" />
                  <circle cx="125" cy="35" r="46" stroke="#10b981" strokeWidth="0.8" strokeDasharray="2 3" />
                  <circle cx="125" cy="35" r="64" stroke="#10b981" strokeWidth="0.8" />
                  <path d="M 60,10 Q 110,45 160,20" stroke="#14b8a6" strokeWidth="0.8" />
                  <path d="M 75,40 Q 120,75 160,50" stroke="#14b8a6" strokeWidth="0.8" />
                  <path d="M 90,70 Q 130,100 160,80" stroke="#14b8a6" strokeWidth="0.8" />
                </svg>
                <div className="absolute top-[21px] right-[21px] text-[#059669] drop-shadow-xs">
                  <MapPin size={22} className="fill-[#10b981] text-white" strokeWidth={1.5} />
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                {/* Left: Concentric Green Checkmark Circle + Information */}
                <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                  {/* Concentric Circle Icon */}
                  <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 sm:w-15 sm:h-15 rounded-full bg-emerald-500/20">
                      <div className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#00a86b] to-[#059669] shadow-[0_4px_12px_rgba(0,168,107,0.35)] text-white">
                        <Check size={22} strokeWidth={3.5} className="stroke-white" />
                      </div>
                    </div>
                  </div>

                  {/* Text & Status Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                        {isReturn ? 'Back in Office Premises' : 'Presence Verified'}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] sm:text-xs font-bold border border-[#bbf7d0] shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                        In Perimeter
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1.5 leading-snug">
                      {isReturn 
                        ? 'You are safely back within the office boundary. Warning alerts have stopped.'
                        : 'You are safely within the authorized office boundary.'}
                    </p>

                    {/* Security Progress Indicator */}
                    <div className="w-28 sm:w-36 h-1.5 bg-slate-200/90 rounded-full overflow-hidden mt-3">
                      <div className="w-1/3 h-full bg-[#00a86b] rounded-full" />
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 tracking-[0.2em] uppercase mt-1">
                      SECURE &bull; VERIFIED &bull; ON PREMISES
                    </div>
                  </div>
                </div>

                {/* Right: Allowed Distance Chip & Close Button */}
                <div className="flex items-center gap-2.5 ml-auto sm:ml-0 flex-shrink-0">
                  <div className="bg-white rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center gap-2.5 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                      <MapPin size={15} className="fill-[#059669] text-[#059669]" />
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-sm sm:text-base font-black text-slate-800 tracking-tight font-mono">
                        {displayDist !== null && displayDist !== undefined ? `${displayDist}m` : '24m'}
                      </span>
                      <span className="text-slate-400 text-[11px] sm:text-xs font-medium ml-1.5 whitespace-nowrap">
                        / {displayRadius ?? 50}m allowed
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setMessage(null)}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                    aria-label="Close"
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );

        }

        // Standard Premium Banner for other notifications (errors, info, regular success)
        const isSuccess = message.type === 'success';
        const isInfo = message.type === 'info';

        return (
          <div className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl text-sm border backdrop-blur-md shadow-md animate-in slide-in-from-top-2 duration-300 ${
            isSuccess
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 shadow-emerald-500/5'
              : isInfo
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-900 shadow-blue-500/5'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-900 shadow-rose-500/5'
          }`}>
            <div className={`p-1.5 rounded-xl flex-shrink-0 ${
              isSuccess
                ? 'bg-emerald-500/20 text-emerald-600'
                : isInfo
                ? 'bg-blue-500/20 text-blue-600'
                : 'bg-rose-500/20 text-rose-600'
            }`}>
              {isSuccess ? <CheckCircle size={16} /> : isInfo ? <Info size={16} /> : <AlertTriangle size={16} />}
            </div>
            <span className="flex-1 font-medium mt-0.5 leading-relaxed">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })()}

      {/* ── Heartbeat Monitoring Status Banner (auto-renders on toggle) ── */}
      {isCheckedIn && !isCheckedOut && (
        <div
          key={heartbeatMonitoringEnabled ? 'hb-on' : 'hb-off'}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-xs font-semibold transition-all duration-500 animate-in fade-in slide-in-from-top-1 ${
            heartbeatMonitoringEnabled
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}
        >
          <Activity
            size={14}
            className={heartbeatMonitoringEnabled ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}
          />
          <span>
            {heartbeatMonitoringEnabled
              ? 'Workstation heartbeat monitoring is active — keep this tab open'
              : 'Heartbeat monitoring is OFF — phone lock will not close your session'}
          </span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            heartbeatMonitoringEnabled
              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : 'bg-slate-200 text-slate-500 border-slate-300'
          }`}>
            {heartbeatMonitoringEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
      )}

      {/* GeoStatus / GeoError Banner */}
      {geoStatus && (
        <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-xs text-blue-400 animate-pulse">
          <Loader2 size={14} className="mt-0.5 flex-shrink-0 animate-spin" />
          {geoStatus}
        </div>
      )}
      {geoError && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-400">
          <MapPin size={14} className="mt-0.5 flex-shrink-0" />
          {geoError}
        </div>
      )}

      {/* ── Auto-Checkout & Session Reactivation Banner ── */}
      {todayAtt?.autoCheckedOut && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {todayAtt.reactivationStatus === 'pending' ? (
            <div className="rounded-3xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50/40 p-4 sm:p-5 shadow-md flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-300/60 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Clock className="animate-spin" size={24} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-800">Session Reactivation Under Review</h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                      Pending Management Approval
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 truncate">
                    Reason: <span className="font-medium text-slate-800 italic">"{todayAtt.outOfBoundsReason}"</span> · Your session will automatically resume upon approval.
                  </p>
                </div>
              </div>
              <button
                onClick={() => fetchDashboard()}
                className="px-3.5 py-2 rounded-xl bg-white border border-amber-200 text-amber-700 text-xs font-bold hover:bg-amber-50 flex items-center gap-1.5 shadow-xs flex-shrink-0 transition-colors"
              >
                <RefreshCw size={13} /> Refresh Status
              </button>
            </div>
          ) : todayAtt.reactivationStatus === 'rejected' ? (
            <div className="rounded-3xl border border-rose-300 bg-gradient-to-r from-rose-50 via-red-50/60 to-rose-50/30 p-4 sm:p-5 shadow-md flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-300/60 text-rose-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-800">Attendance Session Closed for Today</h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                    Reactivation Rejected
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Management note: <span className="font-semibold text-rose-700">{todayAtt.reactivationDecisionNotes || 'Request was rejected. Session is permanently closed for today.'}</span>
                </p>
              </div>
            </div>
          ) : isPastShiftEnd ? (
            <div className="rounded-3xl border border-slate-300 bg-gradient-to-r from-slate-50 via-slate-100/70 to-slate-50/40 p-4 sm:p-5 shadow-md flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
                <Clock size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-800">Shift Ended at 6:00 PM IST</h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs">
                    Workday Concluded
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  All accounts are automatically checked out at 6:00 PM IST. Attendance sessions for today are closed.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-rose-300 bg-gradient-to-r from-rose-50 via-red-50/50 to-rose-50/20 p-4 sm:p-5 shadow-md flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-300/60 text-rose-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={24} className="animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-800">Session Suspended — Presence Validation Failed</h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                      Explanation Required
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    You were automatically checked out for being outside authorized office bounds. Submit an explanation to request session reactivation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWarningModal(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 flex-shrink-0 transition-colors"
              >
                Submit Explanation
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 6 KPI Tiles Ribbon (TimeChamp style) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          icon={Clock}
          label="Start Time"
          value={startTimeStr}
          variant="green"
          subtext="First Punch"
        />
        <KpiTile
          icon={Timer}
          label="Working Time"
          value={
            <MainWorkTimerKpi
              checkInTime={todayAtt?.checkInTime}
              checkOutTime={todayAtt?.checkOutTime}
              breaks={todayAtt?.breaks || []}
              activeBreak={att?.activeBreak}
            />
          }
          variant="blue"
          subtext={isCheckedIn ? 'Net Focus Time' : 'Offline'}
        />
        <KpiTile
          icon={Smartphone}
          label="Last Seen"
          value={lastSeenStr}
          variant="purple"
          subtext={todayAtt?.checkInMethod?.replace('_', ' ').toUpperCase() || 'ENFORCED'}
        />
        <KpiTile
          icon={Coffee}
          label="Break Time"
          value={breakTimeStr}
          variant="amber"
          subtext="Deductions"
        />
        <KpiTile
          icon={FileText}
          label="Daily Work Log"
          value={isLogSubmitted ? 'Submitted' : 'Mandatory'}
          variant={isLogSubmitted ? 'green' : 'amber'}
          subtext="Step 1 Req"
          onClick={() => navigate('/daily-log')}
        />
        <KpiTile
          icon={Calendar}
          label="Leave Balance"
          value={`${totalRemainingLeaves} Days`}
          variant="sky"
          subtext="Available"
          onClick={() => navigate('/leave')}
        />
      </div>

      {/* ── Trusted Device Status ── */}
      {!isCheckedIn && <DeviceStatusCard deviceStatus={deviceStatus} navigate={navigate} />}

      {/* ── Device Not Registered / Pending Warning ── */}
      {!isCheckedIn && !isCheckedOut && deviceBlocked && (
        <div className={`rounded-3xl border p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] ${
          deviceStatus?.statusType === 'pending' ? 'border-sky-100 bg-sky-50/70' : 'border-amber-100 bg-amber-50/70'
        }`}>
          <div className="flex items-start gap-3">
            {deviceStatus?.statusType === 'pending' ? (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 flex items-center justify-center flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]">
                <Info size={20} />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(245,158,11,0.4)]">
                <Smartphone size={20} />
              </div>
            )}
            <div>
              {deviceStatus?.statusType === 'pending' || deviceStatus?.statusType === 'pending_other_device' ? (
                <>
                  <p className="font-bold text-slate-800 text-sm">Device Approval Pending</p>
                  <p className="text-xs text-slate-500 mt-1">Your device registration is awaiting admin approval. You will be notified once approved.</p>
                  <button onClick={() => navigate('/device-status')} className="btn-ghost text-xs py-1.5 px-3 mt-2.5">
                    View Request Status
                  </button>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-800 text-sm">Device Not Authorized</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {deviceStatus?.statusType === 'registered_other_device'
                      ? 'You are already registered on another device. Request a device change if you wish to use this device.'
                      : 'You must register this mobile device before you can mark attendance.'}
                  </p>
                  <button onClick={() => navigate('/device-onboarding')} className="btn-primary text-xs py-1.5 px-3 mt-2.5">
                    Register This Device
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Full-Width Attendance Action Panel — pastel soft card ── */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
        {isCheckedIn && isCheckedOut ? (
          <DailyAttendanceReport attendance={{ ...todayAtt, breaks: todayAtt?.breaks || att?.breaks || [] }} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Session Hero (timer when checked-in) & Method UI */}
            <div className={`${isCheckedIn ? 'lg:col-span-5' : 'lg:col-span-6'} flex flex-col justify-between space-y-4`}>
              <div>
                {/* Method header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800 tracking-wide flex items-center gap-2">
                    <span>Attendance Method:</span>
                    <span className="text-violet-600 uppercase font-mono">{activeMethod?.replace('_', ' ') || 'QR CODE'}</span>
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-violet-100/80 text-violet-600 font-medium shadow-[inset_0_1px_2px_rgba(139,92,246,0.15)]">
                    {isCheckedIn ? '🟢 Session Active' : 'Ready to Punch'}
                  </span>
                </div>

                {/* Checked-in session hero — big live timer */}
                {isCheckedIn && !hasActiveBreak && (
                  <div className="relative overflow-hidden rounded-3xl p-6 border border-emerald-100/80 bg-gradient-to-b from-emerald-50/60 via-white/60 to-white/30 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] text-center">
                    <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-200/30 blur-3xl" />
                    <div className="relative">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-emerald-100 text-emerald-600 text-[11px] font-bold tracking-wide mb-3 shadow-[0_4px_12px_-6px_rgba(16,185,129,0.5)]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        MAIN WORK SESSION ACTIVE
                      </div>
                      <MainWorkTimer
                        checkInTime={todayAtt?.checkInTime}
                        checkOutTime={todayAtt?.checkOutTime}
                        breaks={todayAtt?.breaks || []}
                        activeBreak={att?.activeBreak}
                      />
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 mt-2">
                        <span className="text-emerald-700 font-semibold">Continuous Focus</span>
                        {completedBreakMins > 0 && (
                          <span className="text-slate-400">
                            · Break Deductions: <strong className="text-amber-600 font-mono">-{completedBreakMins}m</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active break hero */}
                {isCheckedIn && hasActiveBreak && (
                  <div className="relative overflow-hidden rounded-3xl p-6 border border-amber-200/70 bg-gradient-to-b from-amber-50/80 via-amber-50/40 to-white/30 shadow-[0_16px_40px_-16px_rgba(245,158,11,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] text-center">
                    <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-amber-200/40 blur-3xl" />
                    <div className="relative">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-amber-200 text-amber-600 text-[11px] font-bold tracking-wide mb-3 shadow-[0_4px_12px_-6px_rgba(245,158,11,0.5)]">
                        <Coffee size={13} className="animate-bounce text-amber-500" />
                        ACTIVE BREAK ({att.activeBreak?.type ? att.activeBreak.type.toUpperCase() : 'PERSONAL'})
                      </div>
                      <BreakTimer startedAt={att.activeBreak?.startedAt} />
                      <p className="text-amber-500 text-xs mt-2 font-medium">
                        Started at {new Date(att.activeBreak?.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · End the break to resume focus
                      </p>
                    </div>
                  </div>
                )}

                {/* Method-Specific UI when not checked in */}
                {!isCheckedIn && !isCheckedOut && !deviceBlocked && (
                  <div className="space-y-4">
                    {/* Interactive Method Switcher Tab Bar */}
                    {allowedMethods.length > 1 && (
                      <div className="p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 flex items-center gap-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                        {allowedMethods.includes('biometric') && (
                          <button
                            type="button"
                            id="switch-biometric-btn"
                            onClick={() => handleManualSwitchMethod('biometric')}
                            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              activeMethod === 'biometric'
                                ? 'bg-white text-violet-700 shadow-sm shadow-violet-500/10 border border-violet-100/80 font-bold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            }`}
                          >
                            <Fingerprint size={15} className={activeMethod === 'biometric' ? 'text-violet-600' : 'text-slate-400'} />
                            <span>Biometric</span>
                            {managerDefaultMethod === 'biometric' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200/60">
                                Default
                              </span>
                            )}
                          </button>
                        )}
                        {allowedMethods.includes('wifi_ip') && (
                          <button
                            type="button"
                            id="switch-wifi-btn"
                            onClick={() => handleManualSwitchMethod('wifi_ip')}
                            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              activeMethod === 'wifi_ip'
                                ? 'bg-white text-emerald-700 shadow-sm shadow-emerald-500/10 border border-emerald-100/80 font-bold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            }`}
                          >
                            <Wifi size={15} className={activeMethod === 'wifi_ip' ? 'text-emerald-600' : 'text-slate-400'} />
                            <span>Office WiFi</span>
                            {managerDefaultMethod === 'wifi_ip' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200/60">
                                Default
                              </span>
                            )}
                          </button>
                        )}
                        {allowedMethods.includes('qr_code') && (
                          <button
                            type="button"
                            id="switch-qr-btn"
                            onClick={() => handleManualSwitchMethod('qr_code')}
                            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              activeMethod === 'qr_code'
                                ? 'bg-white text-sky-700 shadow-sm shadow-sky-500/10 border border-sky-100/80 font-bold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            }`}
                          >
                            <QrCode size={15} className={activeMethod === 'qr_code' ? 'text-sky-600' : 'text-slate-400'} />
                            <span>Office QR</span>
                            {managerDefaultMethod === 'qr_code' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200/60">
                                Default
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Fallback Notice Banner */}
                    {fallbackBanner && (
                      <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-800 shadow-sm flex items-start gap-2.5 animate-fadeIn">
                        <AlertTriangle size={17} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="font-semibold text-amber-900 leading-snug">{fallbackBanner}</p>
                          <p className="text-[11px] text-amber-700">
                            You can also tap any method tab above to switch manually.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFallbackBanner(null)}
                          className="text-amber-500 hover:text-amber-800 p-0.5"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* QR Code Method */}
                    {activeMethod === 'qr_code' && (
                      <>
                        {isMobile ? (
                          <div>
                            <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] mb-4">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 flex items-center justify-center flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]">
                                <QrCode size={18} />
                              </div>
                              <div>
                                <p className="text-slate-800 font-semibold text-sm">Office QR Code</p>
                                <p className="text-slate-400 text-xs">Scan the QR code displayed at your office entrance using your registered mobile.</p>
                              </div>
                            </div>
                            <button
                              id="scan-qr-btn"
                              onClick={handleStartScanClick}
                              disabled={!!actionLoading || geoLoading}
                              className="btn-primary btn-lg w-full shadow-md shadow-sky-500/20"
                            >
                              {actionLoading === 'checkin' ? (
                                <>
                                  <Loader2 size={20} className="animate-spin" /> Verifying Attendance…
                                </>
                              ) : (
                                <>
                                  <Camera size={20} /> Scan Office QR Code to Check In
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="p-4 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] text-center">
                            <p className="font-semibold text-slate-800 text-sm mb-1">Office Attendance QR</p>
                            <p className="text-xs text-slate-400 mb-3">
                              Scan this QR code using the Employee Portal on your registered mobile device.
                            </p>
                            {officeQrDataUrl ? (
                              <div className="bg-white p-2.5 rounded-2xl inline-block mx-auto mb-3 shadow-[0_10px_26px_-10px_rgba(139,92,246,0.45)] border border-violet-100">
                                <img src={officeQrDataUrl} alt="Office QR Code" className="w-36 h-36" />
                              </div>
                            ) : (
                              <div className="w-36 h-36 bg-slate-100/80 rounded-2xl mx-auto mb-3 flex flex-col gap-2 items-center justify-center border border-violet-50">
                                <Loader2 size={24} className="animate-spin text-violet-300" />
                                <span className="text-xs text-slate-400">Loading QR...</span>
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-500 text-left bg-white/80 rounded-2xl p-2.5 border border-violet-50">
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">1</span>Open Employee Portal on your mobile</div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">2</span>Tap "Scan Office QR Code"</div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">3</span>Point camera at this QR code</div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* WiFi / IP Method */}
                    {activeMethod === 'wifi_ip' && (
                      <div className="space-y-3">
                        {networkLoading && !networkStatus ? (
                          <div className="p-3.5 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] flex items-center justify-center gap-2 text-xs text-slate-400">
                            <Loader2 size={14} className="animate-spin text-sky-500" />
                            Checking office network connectivity…
                          </div>
                        ) : networkStatus?.isOfficeNetwork ? (
                          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-100 space-y-1.5 shadow-[inset_0_1px_2px_rgba(16,185,129,0.1)]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs">
                                <CheckCircle size={15} /> Connected to Authorized Office Network
                              </div>
                              {networkStatus.maskedIp && (
                                <span className="text-[10px] font-mono text-emerald-600 bg-white/80 px-2 py-0.5 rounded-full">
                                  {networkStatus.maskedIp}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Gateway verified for <strong className="text-slate-700">{networkStatus.officeName || 'Office'}</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-100 space-y-1.5 shadow-[inset_0_1px_2px_rgba(245,158,11,0.12)]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-amber-600 font-semibold text-xs">
                                <AlertCircle size={15} /> Not on Authorized Office Network
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Please connect to office WiFi: <strong className="text-violet-600 font-semibold">{networkStatus?.targetSsid || 'Office WiFi'}</strong>.
                            </p>
                          </div>
                        )}

                        <button
                          id="check-in-btn"
                          onClick={() => handleCheckIn()}
                          disabled={!!actionLoading || geoLoading}
                          className="btn-success btn-lg w-full shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'checkin' ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
                          {actionLoading === 'checkin' ? 'Verifying Network & GPS…' : 'Verify Network & Check In'}
                        </button>
                      </div>
                    )}

                    {/* Biometric Method */}
                    {activeMethod === 'biometric' && (
                      <div className="space-y-3">
                        {biometricStatus?.isBiometricEnrolled ? (
                          <div className="space-y-3">
                            <div className="p-3 bg-emerald-50/80 border border-emerald-100 rounded-2xl flex items-center gap-2 text-xs text-emerald-600 font-medium shadow-[inset_0_1px_2px_rgba(16,185,129,0.1)]">
                              <CheckCircle size={16} /> Device Biometric Ready ({biometricStatus.credentialCount ?? 1} credential{(biometricStatus.credentialCount ?? 1) !== 1 ? 's' : ''} registered)
                            </div>
                            <button
                              id="biometric-checkin-btn"
                              onClick={handleBiometricCheckIn}
                              disabled={!!actionLoading || geoLoading}
                              className="btn-primary btn-lg w-full shadow-md shadow-sky-500/20 flex items-center justify-center gap-2"
                            >
                              {actionLoading === 'biometric-checkin' ? (
                                <>
                                  <Loader2 size={20} className="animate-spin" /> Touch Sensor…
                                </>
                              ) : (
                                <>
                                  <Fingerprint size={20} /> Verify Biometric & Check In
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="p-4 bg-violet-50/80 border border-violet-100 rounded-2xl text-center space-y-2.5 shadow-[inset_0_1px_2px_rgba(139,92,246,0.12)]">
                            <p className="text-xs text-violet-700 font-medium">
                              Device biometric is not set up yet. Enable it once on this registered phone to mark attendance.
                            </p>
                            <button
                              id="enable-biometric-btn"
                              onClick={handleEnrollBiometric}
                              disabled={!!actionLoading}
                              className="btn-primary w-full py-3 text-xs font-semibold flex items-center justify-center gap-2"
                            >
                              {actionLoading === 'biometric-enroll' ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />} Enable Biometric Attendance
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Checked-in status display — compact info strip */}
                {isCheckedIn && (
                  <div className="p-4 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Checked In At</span>
                        <span className="font-semibold text-slate-800 font-mono">{new Date(todayAtt.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Verified Via</span>
                        <span className="font-semibold text-violet-600 capitalize">{todayAtt?.checkInMethod?.replace('_', ' ') || 'Office QR'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Break Time</span>
                        <span className="font-semibold text-amber-600 font-mono">{breakTimeStr}</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100 flex items-center gap-2 text-xs text-emerald-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Authorized Office Attendance Active</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Timers, Breaks & Step 1/Step 2 Progression */}
            <div className={`${isCheckedIn ? 'lg:col-span-7' : 'lg:col-span-6'} flex flex-col justify-between space-y-4`}>
              {isCheckedIn && (
                <div className="space-y-4">
                  {/* Step 1: Mandatory Daily Log Sheet */}
                  <div className={`p-4 rounded-3xl border transition-all shadow-[0_8px_22px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.8)] ${
                    isLogSubmitted
                      ? 'bg-emerald-50/70 border-emerald-100'
                      : 'bg-amber-50/70 border-amber-100'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className={isLogSubmitted ? 'text-emerald-600' : 'text-amber-600'} />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Step 1: Daily Work Log Sheet
                        </span>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        isLogSubmitted 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {isLogSubmitted ? <><CheckCircle size={12} /> Submitted</> : <><XCircle size={12} /> Mandatory Before Check-Out</>}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mb-3">
                      {isLogSubmitted ? '✅ Today’s work summary is submitted. Check-out is unlocked.' : 'You must fill and submit your daily work log sheet before check-out is unlocked.'}
                    </p>

                    {!isLogSubmitted ? (
                      isLogSheetLocked ? (
                        <div className="w-full py-2.5 px-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold flex items-start gap-2 shadow-sm text-left">
                          <Lock size={15} className="mt-0.5 flex-shrink-0" />
                          <span>Deadline missed (8:00 PM). Please approach your manager to upload your log sheet and check you out.</span>
                        </div>
                      ) : (
                        <button
                          id="open-daily-log-btn"
                          onClick={() => navigate('/daily-log')}
                          className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
                        >
                          <FileText size={15} /> Fill & Submit Daily Log Sheet
                        </button>
                      )
                    ) : (
                      <button
                        id="view-daily-log-btn"
                        onClick={() => navigate('/daily-log')}
                        className="btn-ghost w-full py-1.5 text-xs text-slate-700 hover:text-slate-900 flex items-center justify-center gap-1.5 border border-slate-200"
                        disabled={isLogSheetLocked}
                      >
                        <FileText size={13} /> {isLogSheetLocked ? 'Log Sheet Locked' : 'Update Submitted Daily Log'}
                      </button>
                    )}
                  </div>

                  {/* Step 2: Check Out */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Step 2: Check-Out
                      </span>
                      <span className={`text-[11px] font-semibold ${isLogSubmitted ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isLogSubmitted ? '🟢 Unlocked' : '🔒 Locked'}
                      </span>
                    </div>

                    {!isLogSubmitted ? (
                      <div>
                        <button
                          id="check-out-btn-blocked"
                          disabled={true}
                          onClick={() => {
                            showMessage('error', '⚠️ Log sheet is mandatory before check-out. Please complete Step 1 first.');
                            navigate('/daily-log');
                          }}
                          className="w-full py-3.5 px-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed opacity-75"
                        >
                          <Lock size={16} className="text-slate-400" />
                          Check-Out Blocked (Submit Log Sheet First)
                        </button>
                      </div>
                    ) : (
                      <div>
                        <button
                          id="check-out-btn"
                          onClick={handleCheckOutClick}
                          disabled={!!actionLoading || geoLoading}
                          className="btn-danger btn-lg w-full shadow-md shadow-rose-500/20 flex items-center justify-center gap-2 animate-in fade-in"
                        >
                          {actionLoading === 'checkout' ? <Loader2 size={20} className="animate-spin" /> : <LogOut size={20} />}
                          {actionLoading === 'checkout' ? 'Checking Out…' : 'Check Out'}
                        </button>
                        {isMobile && (
                          <button
                            id="manual-scan-checkout-btn"
                            onClick={() => setShowCheckoutScanner(true)}
                            className="btn-ghost text-xs w-full mt-2 py-2 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 hover:text-slate-900"
                          >
                            <Camera size={14} className="text-sky-600" />
                            Scan PC Screen to Check Out
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Break Controls */}
                  <div className="mt-2">
                    {!hasActiveBreak ? (
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          id="start-personal-break-btn"
                          onClick={() => handleBreakStart('personal')}
                          disabled={!!actionLoading}
                          className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5 border border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-all"
                        >
                          {actionLoading === 'break-start' ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} className="text-amber-600" />}
                          Take Short Break
                        </button>
                      </div>
                    ) : (
                      <button
                        id="end-break-btn"
                        onClick={handleBreakEnd}
                        disabled={!!actionLoading}
                        className="w-full py-3 text-sm font-bold text-white rounded-2xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 bg-[linear-gradient(135deg,#fbbf24_0%,#f59e0b_50%,#f97316_100%)] hover:bg-[linear-gradient(135deg,#f59e0b_0%,#d97706_50%,#ea580c_100%)] shadow-[0_10px_24px_-8px_rgba(245,158,11,0.65),inset_0_1px_0_rgba(255,255,255,0.3)] hover:shadow-[0_14px_30px_-8px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.3)]"
                      >
                        {actionLoading === 'break-end' ? <Loader2 size={18} className="animate-spin" /> : <Timer size={18} />}
                        End Break & Resume Focus
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Offline Guidance when not checked in */}
              {!isCheckedIn && (
                <div className="p-4 rounded-2xl border border-white/90 bg-white/70 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] space-y-2.5 text-xs text-slate-500">
                  <p className="font-bold text-slate-800 text-sm">Attendance Verification Rules</p>
                  <p>1. Your registered mobile hardware is verified via strict cryptographic lock.</p>
                  <p>2. High-precision GPS geofencing confirms physical presence at an authorized office location.</p>
                  <p>3. Submit your mandatory daily log before checking out at the end of the day.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Two-Column Bottom Row (TimeChamp style) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Work Breakdown Donut Chart */}
        <div className="lg:col-span-5 flex flex-col">
          <Panel
            title="Workday Time Breakdown"
            subtitle="Today's distribution between productive work and breaks"
            badge="Live"
            icon={BarChart3}
            iconVariant="blue"
            className="h-full"
          >
            <DonutChart
              data={workBreakdownData}
              centerValue={`${Math.floor(liveWorkMins / 60)}h ${liveWorkMins % 60}m`}
              centerLabel="Work Time"
            />
          </Panel>
        </div>

        {/* Right: Recent Attendance History Table */}
        <div className="lg:col-span-7 flex flex-col">
          <Panel
            title="Recent Attendance History"
            subtitle="Your past attendance logs and verification methods"
            badge={`${history.length} Records`}
            icon={Clock}
            iconVariant="blue"
            className="h-full"
          >
            {history.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                No past attendance records found.
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.08em]">
                        <th className="py-2.5 pl-2">Date</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5">Check-In</th>
                        <th className="py-2.5">Check-Out</th>
                        <th className="py-2.5 pr-2 text-right">Work Hours</th>
                        <th className="py-2.5 pr-2 text-right">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-50">
                      {paginatedHistory.map((rec) => {
                        const statusConfig = {
                          present: { label: 'Present', color: 'bg-emerald-50 text-emerald-600' },
                          half_day: { label: 'Half Day', color: 'bg-amber-50 text-amber-600' },
                          on_leave: { label: 'On Leave', color: 'bg-sky-50 text-sky-600' },
                          absent: { label: 'Absent', color: 'bg-rose-50 text-rose-600' },
                        };
                        const st = statusConfig[rec.status] || { label: rec.status, color: 'bg-slate-100 text-slate-600' };
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = rec.date === todayStr;
                        let workMins = Number(rec.actualWorkMinutes ?? rec.totalWorkMinutes ?? 0);
                        if (isToday && isCheckedIn) {
                          workMins = liveWorkMins;
                        } else if (workMins <= 0 && rec.checkInTime) {
                          if (rec.checkOutTime) {
                            const checkInMs = new Date(rec.checkInTime).getTime();
                            const checkOutMs = new Date(rec.checkOutTime).getTime();
                            const totalMs = Math.max(0, checkOutMs - checkInMs);
                            const breakMins = Number(rec.totalBreakMinutes ?? rec.completedBreakMinutes ?? 0);
                            workMins = Math.max(0, Math.floor(totalMs / 60000) - breakMins);
                          }
                        }
                        const workHoursStr = workMins > 0
                          ? `${Math.floor(workMins / 60)}h ${String(workMins % 60).padStart(2, '0')}m`
                          : (isToday && isCheckedIn ? `${Math.floor(liveWorkMins / 60)}h ${String(liveWorkMins % 60).padStart(2, '0')}m` : '—');

                        return (
                          <tr key={rec._id || rec.date} className="hover:bg-violet-50/40 transition-colors">
                            <td className="py-3.5 pl-2 font-medium text-slate-800 font-mono align-middle">
                              {rec.date}
                            </td>
                            <td className="py-3.5 align-middle">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${st.color}`}>
                                {st.label}
                              </span>
                            </td>
                            <td className="py-3.5 text-slate-600 font-mono align-middle">
                              {rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase() : '—'}
                            </td>
                            <td className="py-3.5 text-slate-600 font-mono align-middle">
                              <div className="flex items-center gap-1.5">
                                {isToday && isCheckedIn && !isCheckedOut ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-sans shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active Now
                                  </span>
                                ) : (
                                  <span>{rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase() : '—'}</span>
                                )}
                              </div>
                              {rec.reactivationStatus === 'approved' && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[10.5px] font-medium text-emerald-800 mt-1 shadow-2xs font-sans">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                  <span>Reapproved</span>
                                  {rec.reactivationDecisionNotes && (
                                    <span className="text-slate-500 italic font-normal truncate max-w-[140px]" title={rec.reactivationDecisionNotes}>
                                      ({rec.reactivationDecisionNotes})
                                    </span>
                                  )}
                                </div>
                              )}
                              {rec.autoCheckedOut && !rec.reactivationStatus && (
                                <div className="text-[10.5px] text-amber-600 font-sans mt-0.5 flex items-center gap-1">
                                  <span>⚡</span>
                                  <span>Auto-closed</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 pr-2 text-right font-mono font-bold text-slate-800 align-middle">
                              {isToday && isCheckedIn && !isCheckedOut ? (() => {
                                const liveTotalSecs = Math.max(0, Math.floor(calculateLiveWorkMs(
                                  todayAtt?.checkInTime || rec.checkInTime,
                                  todayAtt?.checkOutTime,
                                  todayAtt?.breaks || att?.breaks || rec.breaks || [],
                                  att?.activeBreak
                                ) / 1000));
                                const liveH = Math.floor(liveTotalSecs / 3600);
                                const liveM = Math.floor((liveTotalSecs % 3600) / 60);
                                const liveS = liveTotalSecs % 60;
                                return (
                                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {liveH}h {String(liveM).padStart(2, '0')}m {String(liveS).padStart(2, '0')}s
                                    <span className="text-[10px] text-emerald-600 font-medium font-sans">(Live)</span>
                                  </span>
                                );
                              })() : (
                                <span>{workHoursStr}</span>
                              )}
                            </td>

                            <td className="py-3.5 pr-2 align-middle">
                              <div className="flex items-center justify-end gap-1.5 text-slate-500">
                                <span className="w-6 h-6 rounded-lg bg-violet-50 text-violet-500 flex items-center justify-center flex-shrink-0">
                                  <QrCode size={12} />
                                </span>
                                <span className="font-medium whitespace-nowrap">
                                  {(rec.checkInMethod || 'QR Code').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls — pastel style */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-violet-100/70 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>Show</span>
                    <select
                      value={historyPageSize}
                      onChange={(e) => {
                        setHistoryPageSize(Number(e.target.value));
                        setHistoryPage(1);
                      }}
                      className="bg-white border border-violet-100 rounded-xl px-2.5 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-violet-300 shadow-[0_2px_8px_-3px_rgba(148,163,184,0.4)]"
                    >
                      <option value={5}>5 / page</option>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                    </select>
                    <span>entries</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">
                      Page {historyPage} of {totalHistoryPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                        className="p-1.5 rounded-full bg-white border border-violet-100 text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:shadow-[0_4px_12px_-4px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        title="Previous page"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        disabled={historyPage === totalHistoryPages}
                        className="p-1.5 rounded-full bg-white border border-violet-100 text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:shadow-[0_4px_12px_-4px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        title="Next page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Mobile Camera Scanner Overlay for Office QR Check-In ── */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-violet-100 rounded-3xl p-5 shadow-[0_30px_80px_-20px_rgba(139,92,246,0.5)] relative text-center">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center flex-shrink-0 shadow-[0_4px_10px_-3px_rgba(139,92,246,0.4)]">
                  <QrCode size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">Scan Office QR Code</h3>
                  <p className="text-[11px] text-slate-400">Point at the QR code at your office entrance</p>
                </div>
              </div>
              <button
                onClick={() => setShowScanner(false)}
                className="w-8 h-8 rounded-full bg-slate-100/80 text-slate-400 hover:text-violet-600 hover:bg-violet-50 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <CameraQrScanner
              scannerId="qr-office-reader"
              validator={isValidOfficeQr}
              expectedLabel="Office QR"
              onScan={(text) => handleCheckIn(text)}
              onCancel={() => setShowScanner(false)}
            />
          </div>
        </div>
      )}

      {/* ── Mobile Camera Scanner Overlay for PC QR ── */}
      {showCheckoutScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-violet-100 rounded-3xl p-5 text-center shadow-[0_30px_80px_-20px_rgba(139,92,246,0.5)]">
            <h3 className="text-base font-bold text-slate-800 mb-1">Scan PC Screen</h3>
            <p className="text-xs text-slate-400 mb-4">Point your camera at the QR code displayed on your PC to complete check-out.</p>
            <CameraQrScanner
              scannerId="qr-checkout-reader"
              validator={isValidCheckoutQr}
              expectedLabel="PC Screen QR"
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
        teamName={dashboard?.teamName || user?.teamName || user?.teamId?.name || (typeof user?.teamId === 'object' ? user?.teamId?.name : '') || ''}
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

      {/* ── Check-In Permissions Gate Modal ── */}
      <CheckInPermissionsModal
        isOpen={showPermissionsGate}
        onClose={() => setShowPermissionsGate(false)}
        onPermissionsGranted={handlePermissionsGranted}
      />

      {/* ── Continuous Presence Warning Modal ── */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-rose-200 rounded-3xl p-6 shadow-2xl relative text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <AlertTriangle size={32} className="text-rose-600 animate-pulse" />
            </div>
            
            {isCheckedOut ? (
              <>
                {todayAtt?.reactivationStatus === 'pending' ? (
                  <div className="text-center py-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
                      <Clock size={24} className="animate-spin" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Reactivation Under Review</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      Your explanation has been sent to your manager. Once approved, your session will automatically resume.
                    </p>
                    {todayAtt.outOfBoundsReason && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left mb-4">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Submitted Reason:</p>
                        <p className="text-xs text-slate-700 mt-0.5 italic">"{todayAtt.outOfBoundsReason}"</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchDashboard()}
                        className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs"
                      >
                        Refresh Status
                      </button>
                      <button
                        onClick={() => setShowWarningModal(false)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : todayAtt?.reactivationStatus === 'rejected' ? (
                  <div className="text-center py-2">
                    <h3 className="text-lg font-bold text-rose-700 mb-1">Session Closed for Today</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      Management reviewed and rejected the reactivation request. You cannot re-enter the session today.
                    </p>
                    {todayAtt.reactivationDecisionNotes && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-left mb-4">
                        <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Management Note:</p>
                        <p className="text-xs text-rose-800 mt-0.5">{todayAtt.reactivationDecisionNotes}</p>
                      </div>
                    )}
                    <button
                      onClick={() => setShowWarningModal(false)}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-slate-800 mb-1">Session Suspended</h3>
                    <p className="text-xs text-slate-600 mb-3">
                      You were automatically checked out due to presence validation failure. Submit an explanation to request session reactivation.
                    </p>
                    <div className="mb-4 text-left">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Reason for leaving premises / silence:
                      </label>
                      <textarea 
                        value={outOfBoundsReason}
                        onChange={(e) => setOutOfBoundsReason(e.target.value)}
                        className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                        rows={3}
                        placeholder="E.g., Client meeting at client site, medical emergency..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSubmitOutOfBoundsReason}
                        disabled={reasonSubmitting}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm"
                      >
                        {reasonSubmitting ? <Loader2 className="animate-spin" size={16} /> : 'Submit for Manager Review'}
                      </button>
                      <button
                        onClick={() => setShowWarningModal(false)}
                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                      >
                        Later
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-slate-800 mb-1">Outside Office Location</h3>
                {currentDistance !== null && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold mb-3">
                    <span>📍 Current Distance: <strong>{currentDistance}m</strong></span>
                    <span className="text-rose-300">|</span>
                    <span>Allowed: <strong>{officeRadius ?? 100}m</strong></span>
                  </div>
                )}
                <p className="text-sm text-slate-600 mb-4">
                  {currentDistance !== null
                    ? `You are ${currentDistance}m from the office location, which is outside the authorized ${officeRadius ?? 100}m geofence. Please return immediately.`
                    : 'You appear to be outside the authorized office geofence. Please return immediately.'}
                </p>
                
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-4">
                  {warningCount < 5 ? (
                    <p className="text-rose-600 font-semibold">Warning {warningCount} of 5</p>
                  ) : (
                    <>
                      <p className="text-rose-700 font-bold mb-1">Final Grace Period</p>
                      <div className="text-3xl font-black text-rose-600 font-mono tracking-wider">
                        {Math.floor(gracePeriodSeconds / 60).toString().padStart(2, '0')}:
                        {(gracePeriodSeconds % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-xs text-rose-500 mt-1">Return to office before timer expires!</p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

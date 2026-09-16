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
  Calendar, RefreshCw, BarChart3
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

// ── Main Work Timer Component (Continuous net focus time minus breaks) ─────────
const MainWorkTimer = ({ checkInTime, completedBreakMinutes = 0, activeBreak = null }) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) return;
    const calc = () => {
      const now = Date.now();
      const checkInMs = new Date(checkInTime).getTime();
      const totalElapsedMs = Math.max(0, now - checkInMs);
      const completedBreakMs = (Number(completedBreakMinutes) || 0) * 60 * 1000;
      let activeBreakMs = 0;
      if (activeBreak?.startedAt) {
        activeBreakMs = Math.max(0, now - new Date(activeBreak.startedAt).getTime());
      }
      const netMs = Math.max(0, totalElapsedMs - completedBreakMs - activeBreakMs);
      return Math.floor(netMs / 1000);
    };

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, completedBreakMinutes, activeBreak]);

  return (
    <div className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-wider">
      {formatTimerSeconds(netSeconds)}
    </div>
  );
};

// ── Compact Live Work Timer for KPI Tile ─────────────────────────────────────
const MainWorkTimerKpi = ({ checkInTime, completedBreakMinutes = 0, activeBreak = null }) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) return;
    const calc = () => {
      const now = Date.now();
      const checkInMs = new Date(checkInTime).getTime();
      const totalElapsedMs = Math.max(0, now - checkInMs);
      const completedBreakMs = (Number(completedBreakMinutes) || 0) * 60 * 1000;
      let activeBreakMs = 0;
      if (activeBreak?.startedAt) {
        activeBreakMs = Math.max(0, now - new Date(activeBreak.startedAt).getTime());
      }
      const netMs = Math.max(0, totalElapsedMs - completedBreakMs - activeBreakMs);
      return Math.floor(netMs / 1000);
    };

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, completedBreakMinutes, activeBreak]);

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

  const getLocation = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported.'));
      return;
    }
    
    setLoading(true);
    setGeoError(null);
    setGeoStatus('Getting precise location...');

    const readings = [];
    let finished = false;
    let watchId;
    let timeoutId;

    const finish = (locationError = null) => {
      if (finished) return;
      finished = true;

      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);

      setLoading(false);
      setGeoStatus(null);

      if (locationError) {
        setGeoError(locationError.message || 'Unable to get location');
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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
    if (dashboard?.activeMethod !== 'wifi_ip') return;
    setNetworkLoading(true);
    try {
      const res = await api.get('/employee/network-status');
      setNetworkStatus(res.data?.data || null);
    } catch {
      // Ignore network status fetch errors
    } finally {
      setNetworkLoading(false);
    }
  }, [dashboard?.activeMethod]);

  const fetchBiometricStatus = useCallback(async () => {
    try {
      const status = await getBiometricStatus();
      setBiometricStatus(status);
    } catch {
      // ignore
    }
  }, []);

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

  const handleCheckIn = async (scannedQrValue = null, extraPayload = {}) => {
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
        accuracy: loc.accuracy,
        timestamp: loc.timestamp || Date.now(),
        deviceFingerprint: fp,
        ...extraPayload,
      };
      if (dashboard?.activeMethod === 'qr_code') payload.qrCodeValue = finalQrValue;

      await api.post('/employee/attendance/check-in', payload);
      showMessage('success', '✅ Attendance Marked Successfully! You are checked in.');
      fetchDashboard();
      fetchBiometricStatus();
      fetchNetworkStatus();
    } catch (err) {
      const raw = err.response?.data?.message || err.message || 'Check-in failed.';
      showMessage('error', formatAttendanceError(raw));
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
      // If the authenticator is already registered on this device, treat it as success
      // and refresh status so the "Verify Biometric & Check In" button appears.
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
      await handleCheckIn(null, { biometricToken });
    } catch (err) {
      showMessage('error', formatWebAuthnError(err));
      setActionLoading('');
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

  const att = dashboard?.attendance;
  const todayAtt = att?.attendance || null;
  const isCheckedIn = !!(todayAtt?.checkInTime);
  const isCheckedOut = !!(todayAtt?.checkOutTime);
  const hasActiveBreak = !!(att?.activeBreak);
  const isLogSubmitted = Boolean(dashboard?.dailyLogSubmitted || todayDailyLog);
  const dailyLogMissing = isCheckedIn && !isCheckedOut && !isLogSubmitted;
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

  const completedBreakMins = att?.completedBreakMinutes || 0;
  const breakTimeStr = completedBreakMins > 0 ? formatDuration(completedBreakMins) : '00:00';

  // Live tick so the Workday Breakdown stays in sync with the live hero timer
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!isCheckedIn) return;
    const t = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, [isCheckedIn]);

  // Live net productive minutes — same clock as the hero timer, minus breaks
  const liveWorkMins = useMemo(() => {
    if (isCheckedIn && todayAtt?.checkInTime) {
      const elapsedMins = Math.floor((nowTick - new Date(todayAtt.checkInTime).getTime()) / 60000);
      const activeBreakMins = hasActiveBreak && att?.activeBreak?.startedAt
        ? Math.floor((nowTick - new Date(att.activeBreak.startedAt).getTime()) / 60000)
        : 0;
      return Math.max(0, elapsedMins - completedBreakMins - activeBreakMins);
    }
    return todayAtt?.actualWorkMinutes || todayAtt?.totalWorkMinutes || 0;
  }, [isCheckedIn, todayAtt, nowTick, hasActiveBreak, att, completedBreakMins]);

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
      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm border animate-in slide-in-from-top-2 duration-300 ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
          <span className="flex-1 font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
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
              completedBreakMinutes={completedBreakMins}
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
                        completedBreakMinutes={completedBreakMins}
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
                      <button
                        id="open-daily-log-btn"
                        onClick={() => navigate('/daily-log')}
                        className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
                      >
                        <FileText size={15} /> Fill & Submit Daily Log Sheet
                      </button>
                    ) : (
                      <button
                        id="view-daily-log-btn"
                        onClick={() => navigate('/daily-log')}
                        className="btn-ghost w-full py-1.5 text-xs text-slate-700 hover:text-slate-900 flex items-center justify-center gap-1.5 border border-slate-200"
                      >
                        <FileText size={13} /> Update Submitted Daily Log
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
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          id="start-personal-break-btn"
                          onClick={() => handleBreakStart('personal')}
                          disabled={!!actionLoading}
                          className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5 border border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-all"
                        >
                          {actionLoading === 'break-start' ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} className="text-amber-600" />}
                          Take Short Break
                        </button>
                        <button
                          id="start-meal-break-btn"
                          onClick={() => handleBreakStart('meal')}
                          disabled={!!actionLoading}
                          className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5 border border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-all"
                        >
                          {actionLoading === 'break-start' ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} className="text-amber-700" />}
                          Lunch / Meal Break
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
                            <td className="py-3.5 pl-2 font-medium text-slate-800 font-mono">
                              {rec.date}
                            </td>
                            <td className="py-3.5">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${st.color}`}>
                                {st.label}
                              </span>
                            </td>
                            <td className="py-3.5 text-slate-600 font-mono">
                              {rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="py-3.5 text-slate-600 font-mono">
                              {rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="py-3.5 pr-2 text-right font-mono font-bold text-slate-800">
                              {isToday && isCheckedIn && !isCheckedOut ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  {workHoursStr}
                                  <span className="text-[10px] text-emerald-600 font-medium font-sans">(Live)</span>
                                </span>
                              ) : (
                                <span>{workHoursStr}</span>
                              )}
                            </td>
                            <td className="py-3.5 pr-2">
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
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

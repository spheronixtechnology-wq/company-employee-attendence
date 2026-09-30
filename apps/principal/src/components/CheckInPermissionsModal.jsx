import { useState, useEffect, useCallback } from 'react';
import { Camera, MapPin, CheckCircle2, AlertCircle, Lock, RefreshCw, X, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Utility to probe current permission states without triggering prompts.
 * Returns { camera: 'granted' | 'prompt' | 'denied', location: 'granted' | 'prompt' | 'denied' }
 */
export const checkCameraAndLocationPermissions = async () => {
  let camera = 'prompt';
  let location = 'prompt';

  // 1. Check Camera Permission
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      const camStatus = await navigator.permissions.query({ name: 'camera' });
      camera = camStatus.state; // 'granted' | 'prompt' | 'denied'
    }
  } catch {
    camera = 'prompt';
  }

  // 2. Check Geolocation Permission
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
      location = geoStatus.state; // 'granted' | 'prompt' | 'denied'
    }
  } catch {
    location = 'prompt';
  }

  return { camera, location };
};

export default function CheckInPermissionsModal({ isOpen, onClose, onPermissionsGranted }) {
  const [cameraState, setCameraState] = useState('prompt'); // 'prompt' | 'requesting' | 'granted' | 'denied'
  const [locationState, setLocationState] = useState('prompt'); // 'prompt' | 'requesting' | 'granted' | 'denied'
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  // ── Passive Probe on Open (no prompts triggered) ───────────────────────────
  const probePermissions = useCallback(async () => {
    try {
      const perms = await checkCameraAndLocationPermissions();
      // Only set to granted if actually granted; default to 'prompt' so the user can tap
      if (perms.camera === 'granted') setCameraState('granted');
      else setCameraState('prompt');

      if (perms.location === 'granted') setLocationState('granted');
      else setLocationState('prompt');

      if (perms.camera === 'granted' && perms.location === 'granted') {
        onPermissionsGranted?.(null);
      }
    } catch {}
  }, [onPermissionsGranted]);

  useEffect(() => {
    if (isOpen) {
      setErrorDetails('');
      probePermissions();
    }
  }, [isOpen, probePermissions]);

  // ── Step 1: Camera Access (must be invoked from direct user click) ──────────
  const requestCamera = async () => {
    setCameraState('requesting');
    setErrorDetails('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported on this connection. Please use HTTPS or localhost.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });

      // Release the temporary stream tracks immediately
      stream.getTracks().forEach((t) => t.stop());

      setCameraState('granted');
      return true;
    } catch (err) {
      console.warn('Camera request rejected:', err);
      setCameraState('denied');
      setErrorDetails(err.message || 'Camera permission was denied or blocked.');
      return false;
    }
  };

  // ── Step 2: Location Access ─────────────────────────────────────────────────
  const requestLocation = async () => {
    setLocationState('requesting');
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocationState('denied');
        setErrorDetails('Geolocation is not supported in this browser.');
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocationState('granted');
          resolve(coords);
        },
        (err) => {
          console.warn('Geolocation rejected:', err);
          setLocationState('denied');
          setErrorDetails(err.message || 'Location access was denied.');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });
  };

  // ── Main Action: Triggered by user tap (Direct User Activation) ─────────────
  const handleAllowAccess = async () => {
    setIsProcessing(true);
    setErrorDetails('');

    // 1. First request Camera with the active user gesture
    let camOk = cameraState === 'granted';
    if (!camOk) {
      camOk = await requestCamera();
    }

    if (!camOk) {
      setIsProcessing(false);
      return;
    }

    // 2. Second request Location immediately
    let locResult = locationState === 'granted' ? true : null;
    if (!locResult) {
      locResult = await requestLocation();
    }

    setIsProcessing(false);

    if (locResult) {
      // Both permissions granted! Launch scanner smoothly
      setTimeout(() => {
        onPermissionsGranted?.(typeof locResult === 'object' ? locResult : null);
      }, 350);
    }
  };

  if (!isOpen) return null;

  const hasDenied = cameraState === 'denied' || locationState === 'denied';
  const allGranted = cameraState === 'granted' && locationState === 'granted';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-primary-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Attendance Access</h2>
            <p className="text-xs text-slate-400">Permissions required for QR check-in</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mt-2 mb-5">
          Tap below to allow Camera and Location access when prompted by your browser.
        </p>

        {/* Permission Cards */}
        <div className="space-y-3 mb-5">
          {/* ── 1. Camera Card ── */}
          <div className={`p-3.5 rounded-2xl border transition-all ${
            cameraState === 'granted'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : cameraState === 'denied'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-slate-800/60 border-slate-700/60'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  cameraState === 'granted'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : cameraState === 'denied'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700/60 text-primary-400'
                }`}>
                  <Camera size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">1. Camera Access</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {cameraState === 'requesting' ? 'Requesting camera...' : 'Required to scan the office QR code'}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex-shrink-0">
                {cameraState === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    <CheckCircle2 size={12} /> Granted
                  </span>
                )}
                {cameraState === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/15 px-2.5 py-1 rounded-full border border-red-500/30">
                    <AlertCircle size={12} /> Blocked
                  </span>
                )}
                {cameraState === 'requesting' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-400 bg-primary-500/15 px-2.5 py-1 rounded-full border border-primary-500/30 animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> Asking...
                  </span>
                )}
                {cameraState === 'prompt' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                    Required
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. Location Card ── */}
          <div className={`p-3.5 rounded-2xl border transition-all ${
            locationState === 'granted'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : locationState === 'denied'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-slate-800/60 border-slate-700/60'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  locationState === 'granted'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : locationState === 'denied'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700/60 text-blue-400'
                }`}>
                  <MapPin size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">2. Location Access</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {locationState === 'requesting' ? 'Requesting GPS...' : 'Required to verify physical presence'}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex-shrink-0">
                {locationState === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    <CheckCircle2 size={12} /> Granted
                  </span>
                )}
                {locationState === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/15 px-2.5 py-1 rounded-full border border-red-500/30">
                    <AlertCircle size={12} /> Blocked
                  </span>
                )}
                {locationState === 'requesting' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-500/15 px-2.5 py-1 rounded-full border border-blue-500/30 animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> Asking...
                  </span>
                )}
                {locationState === 'prompt' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                    Required
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Instructions if Blocked in Chrome Settings ── */}
        {hasDenied && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-5 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <Lock size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-amber-300">Unblock in Chrome Settings</p>
                <ol className="list-decimal pl-4 space-y-1 text-slate-400">
                  <li>Tap the <strong>lock / settings icon 🔒</strong> next to the address bar at the top of Chrome.</li>
                  <li>Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).</li>
                  <li>Set <strong>Camera</strong> & <strong>Location</strong> to <strong>Allow</strong> (or Reset).</li>
                  <li>Tap <strong>Allow Access Now</strong> below.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleAllowAccess}
            disabled={isProcessing || allGranted}
            className="btn-primary flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Asking Browser...
              </>
            ) : allGranted ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-400" /> Opening Scanner...
              </>
            ) : hasDenied ? (
              <>
                <RefreshCw size={16} /> Allow Access Now
              </>
            ) : (
              <>
                Allow Camera & Location <ArrowRight size={16} />
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="btn-ghost px-4 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

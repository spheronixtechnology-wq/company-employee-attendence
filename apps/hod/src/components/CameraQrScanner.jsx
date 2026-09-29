import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertTriangle, AlertCircle, QrCode } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

// ── Client-Side Structural QR Validators ─────────────────────────────────────
const isValidCollegeQr = (text) => {
  if (!text || typeof text !== 'string') return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(
      parsed &&
      parsed.type === 'COLLEGE_QR' &&
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
  expectedLabel = 'College QR',
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

export { CameraQrScanner, isValidCollegeQr, isValidCheckoutQr };

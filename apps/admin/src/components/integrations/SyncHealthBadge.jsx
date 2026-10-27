import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2, Clock, AlertTriangle, AlertCircle,
  HelpCircle, ChevronDown, RefreshCw, Sliders
} from 'lucide-react';

export default function SyncHealthBadge({ health, onConfigureInterval }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        <Clock size={11} /> Loading...
      </span>
    );
  }

  const { overallStatus, expectedPollMinutes, feeds = [], reason } = health;

  const getStatusConfig = (status) => {
    switch (status) {
      case 'healthy':
        return {
          pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70',
          dotClass: 'bg-emerald-500 animate-pulse',
          icon: <CheckCircle2 size={12} className="text-emerald-600" />,
          label: 'Healthy',
        };
      case 'delayed':
        return {
          pillClass: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/70',
          dotClass: 'bg-amber-500',
          icon: <Clock size={12} className="text-amber-600" />,
          label: 'Delayed',
        };
      case 'stale':
        return {
          pillClass: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100/70',
          dotClass: 'bg-orange-500',
          icon: <AlertTriangle size={12} className="text-orange-600" />,
          label: 'Stale',
        };
      case 'error':
        return {
          pillClass: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70',
          dotClass: 'bg-rose-500',
          icon: <AlertCircle size={12} className="text-rose-600" />,
          label: 'Sync Error',
        };
      case 'revoked':
        return {
          pillClass: 'bg-slate-100 text-slate-500 border-slate-200',
          dotClass: 'bg-slate-400',
          icon: <AlertCircle size={12} className="text-slate-400" />,
          label: 'Revoked',
        };
      case 'expired':
        return {
          pillClass: 'bg-slate-100 text-slate-500 border-slate-200',
          dotClass: 'bg-slate-400',
          icon: <Clock size={12} className="text-slate-400" />,
          label: 'Expired',
        };
      case 'waiting':
      default:
        return {
          pillClass: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70',
          dotClass: 'bg-slate-400',
          icon: <Clock size={12} className="text-slate-500" />,
          label: 'Waiting',
        };
    }
  };

  const config = getStatusConfig(overallStatus);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-2xs transition-all cursor-pointer ${config.pillClass}`}
        title="Click to view detailed feed health breakdown"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        <span>{config.label}</span>
        <ChevronDown size={11} className={`opacity-60 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-80 rounded-2xl bg-white p-4 shadow-xl border border-slate-200 animate-slide-up text-left">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
              <h4 className="text-xs font-black text-slate-900">Sync Health Diagnosis</h4>
            </div>
            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
              Poll: {expectedPollMinutes || 5}m
            </span>
          </div>

          {reason && (
            <div className="mb-3 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
              {reason}
            </div>
          )}

          {feeds.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2 text-center">
              No feed synchronization logs available yet.
            </p>
          ) : (
            <div className="space-y-2">
              {feeds.map((f) => {
                const feedCfg = getStatusConfig(f.status);
                return (
                  <div
                    key={f.route}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] font-bold text-slate-800">
                        {f.route}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${feedCfg.pillClass}`}>
                        {feedCfg.label}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-slate-600 leading-tight mb-1">
                      {f.message}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 font-mono">
                      <span>Last Code: {f.latestStatusCode || '—'}</span>
                      <span>
                        {f.lastSuccessAt
                          ? `Success: ${new Date(f.lastSuccessAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'No success yet'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {onConfigureInterval && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onConfigureInterval();
                }}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-violet-50 transition-colors"
              >
                <Sliders size={12} /> Configure Poll Interval
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

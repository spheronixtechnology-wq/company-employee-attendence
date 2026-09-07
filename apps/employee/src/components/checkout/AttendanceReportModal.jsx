import { useState } from 'react';
import {
  CheckCircle, Clock, Coffee, Timer, Send, X,
  FileText, Loader2, Award, ChevronRight
} from 'lucide-react';
import api from '../../lib/api';

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
  const d = new Date(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function AttendanceReportModal({ isOpen, onClose, reportData, onReportSent }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !reportData) return null;

  const summary = reportData.summary || {};
  const attendance = reportData.attendance || {};
  const dailyLog = summary.dailyLog || reportData.dailyLog || null;

  const checkIn = summary.checkInTime || attendance.checkInTime;
  const checkOut = summary.checkOutTime || attendance.checkOutTime;
  const totalDuration = summary.totalDurationMinutes ?? 0;
  const totalBreaks = summary.totalBreakMinutes ?? 0;
  const actualWork = summary.actualWorkMinutes ?? Math.max(0, totalDuration - totalBreaks);
  const breaks = summary.breaks || attendance.breaks || [];

  const handleSendReport = async () => {
    setSending(true);
    setError(null);
    try {
      await api.post('/employee/attendance/send-report');
      setSent(true);
      if (onReportSent) onReportSent();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send report to manager.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Daily Attendance Report</h2>
              <p className="text-xs text-slate-400">Shift completed and logged successfully</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {sent ? (
            <div className="p-8 text-center bg-emerald-500/10 border border-emerald-500/30 rounded-2xl animate-in zoom-in-95">
              <Award size={42} className="text-emerald-400 mx-auto mb-3 animate-bounce" />
              <h3 className="text-lg font-bold text-white">Report Sent to Manager!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your shift attendance and daily log have been delivered in real time. Have a wonderful evening!
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 bg-danger-500/10 border border-danger-500/30 text-danger-400 text-xs rounded-xl">
                  {error}
                </div>
              )}

              {/* 3 Metric Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center mx-auto mb-1">
                    <Clock size={15} />
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Total Duration</p>
                  <p className="text-sm font-bold text-white mt-0.5">{formatDuration(totalDuration)}</p>
                  <p className="text-[10px] text-slate-500">Gross Shift</p>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-1">
                    <Coffee size={15} />
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Total Breaks</p>
                  <p className="text-sm font-bold text-amber-400 mt-0.5">{formatDuration(totalBreaks)}</p>
                  <p className="text-[10px] text-slate-500">{breaks.length} break{breaks.length === 1 ? '' : 's'}</p>
                </div>

                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-center">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-1">
                    <Timer size={15} />
                  </div>
                  <p className="text-[11px] text-emerald-400 font-medium">Actual Work</p>
                  <p className="text-sm font-extrabold text-emerald-300 mt-0.5">{formatDuration(actualWork)}</p>
                  <p className="text-[10px] text-emerald-400/70">Net Productive</p>
                </div>
              </div>

              {/* Timestamp Row */}
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Check-In Time:</span>
                  <span className="font-semibold text-white">{formatTime(checkIn)}</span>
                </div>
                <div className="flex justify-between text-slate-400 border-t border-slate-800/80 pt-1.5">
                  <span>Check-Out Time:</span>
                  <span className="font-semibold text-white">{formatTime(checkOut)}</span>
                </div>
              </div>

              {/* Break Breakdown */}
              <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Coffee size={13} className="text-amber-400" /> Break Breakdown
                  </span>
                  <span className="text-xs font-mono text-slate-400">{formatDuration(totalBreaks)}</span>
                </div>
                {breaks.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2 bg-slate-800/20 rounded-lg">
                    No breaks recorded during this shift.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {breaks.map((b, idx) => {
                      const bStart = b.startedAt ? new Date(b.startedAt) : null;
                      const bEnd = b.endedAt ? new Date(b.endedAt) : null;
                      const duration = (bStart && bEnd)
                        ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 60000))
                        : 0;
                      const typeLabel = b.type ? (b.type.charAt(0).toUpperCase() + b.type.slice(1)) : 'Personal';
                      return (
                        <div key={b._id || idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg text-xs">
                          <span className="text-slate-300">
                            #{idx + 1} {typeLabel} Break ({formatTime(bStart)} – {formatTime(bEnd)})
                          </span>
                          <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {duration}m
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Today's Daily Log Summary */}
              {dailyLog && (
                <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                  <span className="font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                    <FileText size={13} className="text-primary-400" /> Today's Daily Log
                  </span>
                  {dailyLog.taskTitle && (
                    <p className="text-slate-400">
                      <span className="text-slate-500">Task:</span> <span className="text-white font-medium">{dailyLog.taskTitle}</span>
                    </p>
                  )}
                  {dailyLog.projectName && (
                    <p className="text-slate-400">
                      <span className="text-slate-500">Project:</span> <span className="text-white">{dailyLog.projectName}</span>
                    </p>
                  )}
                  {dailyLog.campaignName && (
                    <p className="text-slate-400">
                      <span className="text-slate-500">Campaign:</span> <span className="text-white">{dailyLog.campaignName}</span>
                    </p>
                  )}
                  {dailyLog.outputSummary && (
                    <p className="text-slate-400">
                      <span className="text-slate-500">Summary:</span> <span className="text-white">{dailyLog.outputSummary}</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Action */}
        {!sent && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/90">
            <button
              id="send-daily-report-btn"
              onClick={handleSendReport}
              disabled={sending}
              className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-500 hover:to-violet-500"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending ? 'Sending to Manager...' : 'Send Daily Report to Manager'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

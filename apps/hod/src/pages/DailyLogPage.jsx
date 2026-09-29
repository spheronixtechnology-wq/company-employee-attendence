import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  FileText,
  CheckCircle,
  Loader2,
  Flame,
  Download,
  Sparkles,
  FileCheck,
  CalendarDays,
  BadgeCheck,
} from 'lucide-react';
import DailyLogDocUpload, { formatFileSize } from '../components/DailyLogDocUpload';

export default function DailyLogPage() {
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/employee/daily-log/me');
      setLogs(res.data.data.logs || []);
      setStreak(res.data.data.streak || 0);
      const today = new Date().toISOString().split('T')[0];
      const todayEntry = res.data.data.logs?.find((l) => l.logDate === today);
      setTodayLog(todayEntry || null);
    } catch (err) {
      console.error('Failed to fetch daily logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please choose or drop a work document (up to 1MB) before submitting.');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);

      const res = await api.post('/employee/daily-log/me', formData);

      setMessage({ type: 'success', text: '✅ Daily log document submitted successfully!' });
      setSelectedFile(null);
      fetchLogs();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Submission failed. Please try again.';
      setMessage({ type: 'error', text: errMsg });
      setUploadError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Streak milestones for the mini progress track
  const streakMilestones = [7, 14, 30];
  const nextMilestone = streakMilestones.find((m) => m > streak) || 30;
  const streakPct = Math.min(100, Math.round((streak / nextMilestone) * 100));

  return (
    <div className="relative min-h-screen p-4 md:p-6 animate-fade-in">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
        <div className="absolute right-1/4 bottom-10 h-64 w-64 rounded-full bg-violet-200/15 blur-3xl" />
      </div>

      <div className="max-w-2xl mx-auto space-y-5">
        {/* ── Gradient Hero Header ── */}
        <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-violet-400 via-fuchsia-400 to-sky-400 shadow-[0_18px_44px_-16px_rgba(139,92,246,0.6)]">
          <div className="relative rounded-[calc(1.5rem-3px)] bg-gradient-to-br from-violet-500/95 via-fuchsia-500/95 to-sky-500/95 px-6 py-6">
            <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/15 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-sky-300/20 blur-3xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white/90 text-[10px] font-bold uppercase tracking-[0.14em] mb-2.5">
                  <CalendarDays size={12} />
                  Daily Compliance
                </div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)]">
                  Daily Work Log
                </h1>
                <p className="text-white/80 text-sm mt-1">
                  Upload today's summary — work hours are calculated automatically.
                </p>
              </div>

              {/* Streak capsule */}
              <div className="flex flex-col items-center bg-white/95 rounded-3xl px-5 py-3.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.45)] flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <Flame size={22} className={`text-amber-500 ${streak > 0 ? 'animate-bounce' : 'opacity-40'}`} />
                  <span className="text-2xl font-extrabold text-slate-800 font-mono tabular-nums">{streak}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-500 mt-0.5">
                  day streak
                </span>
                {/* Streak progress to next milestone */}
                <div className="w-full mt-2">
                  <div className="h-1.5 w-full rounded-full bg-amber-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-700"
                      style={{ width: `${streakPct}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-semibold text-slate-400 mt-1 text-center">
                    {nextMilestone - streak} more to {nextMilestone}-day milestone
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium animate-slide-up ${
              message.type === 'success'
                ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600'
                : 'bg-rose-50/80 border-rose-100 text-rose-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Today's log already submitted */}
        {todayLog && (
          <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.5)]">
            <div className="relative rounded-[calc(1.5rem-3px)] bg-white/90 backdrop-blur-sm p-5 space-y-4">
              <div aria-hidden="true" className="pointer-events-none absolute -top-14 -right-14 w-48 h-48 rounded-full bg-emerald-200/30 blur-3xl" />
              <div className="relative flex items-center justify-between border-b border-violet-50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center shadow-[0_6px_16px_-5px_rgba(16,185,129,0.6)]">
                    <BadgeCheck size={18} />
                  </div>
                  <h2 className="font-bold text-slate-800">Today's Log Submitted</h2>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  {todayLog.hoursSpent}h Logged
                </span>
              </div>

              {/* Document Details Card */}
              <div className="relative p-4 rounded-2xl bg-white/80 border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(139,92,246,0.4)] flex-shrink-0">
                    <FileCheck size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {todayLog.documentName || todayLog.taskTitle || 'Daily Work Document'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {todayLog.documentSize ? `${formatFileSize(todayLog.documentSize)} • ` : ''}
                      Submitted {todayLog.submittedAt ? new Date(todayLog.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                    </p>
                  </div>
                </div>

                {(todayLog.documentUrl || todayLog.attachmentUrl) && (
                  <a
                    href={todayLog.documentUrl || todayLog.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="btn-primary text-xs py-2 px-3.5 flex items-center justify-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
                  >
                    <Download size={14} /> Download Document
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submission Form */}
        {!todayLog && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] space-y-4">
            <div>
              <h2 className="font-bold text-slate-800">Upload Today's Work Document</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Attach your daily work report file (.doc, .docx, .pdf, .xlsx, or .txt) within 1MB size.
              </p>
            </div>

            {/* Shift duration auto-calc banner */}
            <div className="relative overflow-hidden flex items-center gap-2.5 p-3 rounded-2xl bg-violet-50/70 border border-violet-100 text-xs text-violet-600">
              <Sparkles size={15} className="text-violet-500 flex-shrink-0 animate-pulse" />
              <span>Work hours will be calculated automatically based on your active shift duration and breaks.</span>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <DailyLogDocUpload
                file={selectedFile}
                onFileSelect={setSelectedFile}
                error={uploadError}
                setError={setUploadError}
                disabled={submitting}
              />

              <button
                type="submit"
                id="submit-daily-log-btn"
                disabled={submitting || !selectedFile}
                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {submitting ? 'Uploading Document...' : 'Submit Daily Log'}
              </button>
            </form>
          </div>
        )}

        {/* Log History */}
        {logs.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800">Log History</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100/80 text-violet-600 shadow-[inset_0_1px_2px_rgba(139,92,246,0.15)]">
                Last {Math.min(logs.length, 7)} entries
              </span>
            </div>
            <div className="space-y-2">
              {logs.slice(0, 7).map((log) => (
                <div
                  key={log._id}
                  className="group flex items-center justify-between p-3 rounded-2xl border border-violet-50 bg-white/70 hover:bg-white hover:border-violet-100 hover:shadow-[0_6px_18px_-8px_rgba(139,92,246,0.35)] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-bold">
                      {log.logDate?.split('-')[2] || '·'}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 font-mono">{log.logDate}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[260px]">
                        {log.documentName || log.taskTitle || log.projectName || 'Document submitted'}
                      </p>
                      {(log.documentUrl || log.attachmentUrl) && (
                        <a
                          href={log.documentUrl || log.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="text-[11px] text-violet-500 hover:text-violet-600 font-semibold flex items-center gap-1 pt-0.5"
                        >
                          <Download size={11} /> Download Document
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-violet-600 font-mono">{log.hoursSpent}h</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Submitted</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

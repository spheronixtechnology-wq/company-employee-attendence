import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText,
  CheckCircle,
  Loader2,
  Flame,
  Download,
  ExternalLink,
  Sparkles,
  FileCheck,
} from 'lucide-react';
import DailyLogDocUpload, { formatFileSize } from '../components/DailyLogDocUpload';

export default function DailyLogPage() {
  const { user } = useAuth();
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
      setUploadError('Please choose or drop a work document (up to 2MB) before submitting.');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);

      await api.post('/employee/daily-log/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

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

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText size={20} className="text-primary-400" />
              Daily Log
            </h1>
            <p className="text-slate-400 text-sm">Upload your work document summary for today (max 2MB)</p>
          </div>
          {/* Streak */}
          <div className="flex items-center gap-2 bg-warning-500/10 border border-warning-500/30 px-3 py-2 rounded-xl">
            <Flame size={16} className="text-warning-400" />
            <span className="text-warning-400 font-bold text-sm">{streak}</span>
            <span className="text-warning-400/70 text-xs">day streak</span>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium animate-slide-up ${
              message.type === 'success'
                ? 'bg-success-500/10 border-success-500/30 text-success-400'
                : 'bg-danger-500/10 border-danger-500/30 text-danger-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Today's log already submitted */}
        {todayLog && (
          <div className="card border-success-500/30 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle size={20} className="text-success-400" />
                <h2 className="font-semibold text-white">Today's Log Submitted</h2>
              </div>
              <span className="text-xs font-bold text-primary-400 bg-primary-500/10 border border-primary-500/30 px-2.5 py-1 rounded-full">
                {todayLog.hoursSpent}h Logged
              </span>
            </div>

            {/* Document Details Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30 flex-shrink-0">
                  <FileCheck size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
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
                  className="btn-primary text-xs py-2 px-3.5 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md shadow-primary-500/20 self-start sm:self-auto"
                >
                  <Download size={14} /> Download Document
                </a>
              )}
            </div>
          </div>
        )}

        {/* Submission Form */}
        {!todayLog && (
          <div className="card space-y-4">
            <div>
              <h2 className="font-semibold text-white">Upload Today's Work Document</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Attach your daily work report file (.doc, .docx, .pdf, .xlsx, or .txt) within 2MB size.
              </p>
            </div>

            {/* Shift duration auto-calc banner */}
            <div className="flex items-center gap-2.5 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300">
              <Sparkles size={15} className="text-violet-400 flex-shrink-0" />
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
                className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {submitting ? 'Uploading Document...' : 'Submit Daily Log'}
              </button>
            </form>
          </div>
        )}

        {/* Log History */}
        {logs.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Log History</h2>
            <div className="space-y-3">
              {logs.slice(0, 7).map((log) => (
                <div
                  key={log._id}
                  className="flex items-center justify-between py-2.5 border-b border-slate-700/60 last:border-0"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <p className="text-sm font-medium text-white">{log.logDate}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {log.documentName || log.taskTitle || log.projectName || 'Document submitted'}
                    </p>
                    {(log.documentUrl || log.attachmentUrl) && (
                      <a
                        href={log.documentUrl || log.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="text-[11px] text-primary-400 hover:text-primary-300 flex items-center gap-1 underline pt-0.5"
                      >
                        <Download size={11} /> Download Document
                      </a>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary-400">{log.hoursSpent}h</p>
                    <span className="badge-success text-xs">✓ Submitted</span>
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

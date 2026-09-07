import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Paperclip, CheckCircle, Loader2, Flame } from 'lucide-react';

export default function DailyLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const teamName = user?.teamId?.name?.toLowerCase() || '';
  const isTechnical = teamName.includes('technical');
  const isMarketing = teamName.includes('marketing');

  const fetchLogs = async () => {
    try {
      const res = await api.get('/employee/daily-log/me');
      setLogs(res.data.data.logs || []);
      setStreak(res.data.data.streak || 0);
      // Check if today's log exists
      const today = new Date().toISOString().split('T')[0];
      const todayEntry = res.data.data.logs?.find(l => l.logDate === today);
      setTodayLog(todayEntry || null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onSubmit = async (data) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== '') formData.append(k, v);
      });
      if (data.attachment?.[0]) {
        formData.append('attachment', data.attachment[0]);
      }

      await api.post('/employee/daily-log/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMessage({ type: 'success', text: '✅ Daily log submitted successfully!' });
      reset();
      fetchLogs();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Submission failed.' });
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
            <p className="text-slate-400 text-sm">Submit your work summary for today</p>
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
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium animate-slide-up ${
            message.type === 'success'
              ? 'bg-success-500/10 border-success-500/30 text-success-400'
              : 'bg-danger-500/10 border-danger-500/30 text-danger-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Today's log already submitted */}
        {todayLog && (
          <div className="card border-success-500/30">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle size={20} className="text-success-400" />
              <h2 className="font-semibold text-white">Today's Log Submitted</h2>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-slate-400">Hours Spent: <span className="text-white">{todayLog.hoursSpent}h</span></p>
              {todayLog.taskTitle && <p className="text-slate-400">Task: <span className="text-white">{todayLog.taskTitle}</span></p>}
              {todayLog.campaignName && <p className="text-slate-400">Campaign: <span className="text-white">{todayLog.campaignName}</span></p>}
            </div>
          </div>
        )}

        {/* Submission Form */}
        {!todayLog && (
          <div className="card">
            <h2 className="font-semibold text-white mb-5">Submit Today's Log</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Hours Spent */}
              <div>
                <label className="label">Hours Spent *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  className="input"
                  placeholder="e.g. 8"
                  {...register('hoursSpent', { required: 'Hours spent is required', min: 0.5 })}
                />
                {errors.hoursSpent && <p className="text-danger-400 text-xs mt-1">{errors.hoursSpent.message}</p>}
              </div>

              {/* Technical Team Fields */}
              {isTechnical && (
                <>
                  <div>
                    <label className="label">Task Title *</label>
                    <input className="input" placeholder="What did you work on?" {...register('taskTitle', { required: true })} />
                  </div>
                  <div>
                    <label className="label">Project Name *</label>
                    <input className="input" placeholder="Project name" {...register('projectName', { required: true })} />
                  </div>
                  <div>
                    <label className="label">Ticket / Issue ID</label>
                    <input className="input" placeholder="JIRA-1234, #42, etc." {...register('ticketId')} />
                  </div>
                  <div>
                    <label className="label">Blockers</label>
                    <textarea className="input resize-none" rows={3} placeholder="Any blockers or issues?" {...register('blockers')} />
                  </div>
                </>
              )}

              {/* Marketing Team Fields */}
              {isMarketing && (
                <>
                  <div>
                    <label className="label">Campaign Name *</label>
                    <input className="input" placeholder="Campaign name" {...register('campaignName', { required: true })} />
                  </div>
                  <div>
                    <label className="label">Platform *</label>
                    <input className="input" placeholder="Instagram, Google, LinkedIn..." {...register('platform', { required: true })} />
                  </div>
                  <div>
                    <label className="label">Output Summary</label>
                    <textarea className="input resize-none" rows={3} placeholder="What did you achieve?" {...register('outputSummary')} />
                  </div>
                </>
              )}

              {/* Generic fields for other teams */}
              {!isTechnical && !isMarketing && (
                <div>
                  <label className="label">Task Summary *</label>
                  <textarea className="input resize-none" rows={3} placeholder="Describe your work today" {...register('taskTitle', { required: true })} />
                </div>
              )}

              {/* File Attachment */}
              <div>
                <label className="label flex items-center gap-2">
                  <Paperclip size={14} /> Attachment (optional)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-500 cursor-pointer"
                  {...register('attachment')}
                />
              </div>

              <button
                type="submit"
                id="submit-daily-log-btn"
                disabled={submitting}
                className="btn-primary w-full mt-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {submitting ? 'Submitting...' : 'Submit Daily Log'}
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
                <div key={log._id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{log.logDate}</p>
                    <p className="text-xs text-slate-400">{log.taskTitle || log.campaignName || 'Log submitted'}</p>
                  </div>
                  <div className="text-right">
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

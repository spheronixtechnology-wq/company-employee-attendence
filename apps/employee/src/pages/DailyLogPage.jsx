import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Paperclip, CheckCircle, Loader2, Flame, ExternalLink, Link2 } from 'lucide-react';
import DailyLogFields, { isValidGitHubUrl, isValidWebUrl } from '../components/DailyLogFields';

export default function DailyLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [todayLog, setTodayLog] = useState(null);

  const [form, setForm] = useState({
    hoursSpent: '',
    taskTitle: '',
    projectName: '',
    description: '',
    githubLink: '',
    researchLinks: [''],
  });
  const [attachment, setAttachment] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchLogs = async () => {
    try {
      const res = await api.get('/employee/daily-log/me');
      setLogs(res.data.data.logs || []);
      setStreak(res.data.data.streak || 0);
      const today = new Date().toISOString().split('T')[0];
      const todayEntry = res.data.data.logs?.find((l) => l.logDate === today);
      setTodayLog(todayEntry || null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
    if (message) setMessage(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const errors = {};
    if (!form.taskTitle || !form.taskTitle.trim()) {
      errors.taskTitle = 'Task Title is required';
    }
    if (!form.projectName || !form.projectName.trim()) {
      errors.projectName = 'Project Name is required';
    }
    if (!form.description || !form.description.trim()) {
      errors.description = 'Description is required';
    }
    if (form.githubLink && form.githubLink.trim() && !isValidGitHubUrl(form.githubLink.trim())) {
      errors.githubLink = 'Invalid GitHub URL';
    }
    if (Array.isArray(form.researchLinks)) {
      const invalidLink = form.researchLinks.find(
        (l) => l.trim() && !isValidWebUrl(l.trim())
      );
      if (invalidLink) {
        errors.researchLinks = 'One or more research links are invalid URLs';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setMessage({ type: 'error', text: 'Please fill in all required fields and verify your links.' });
      setSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('taskTitle', form.taskTitle.trim());
      formData.append('projectName', form.projectName.trim());
      formData.append('description', form.description.trim());
      if (form.hoursSpent) {
        formData.append('hoursSpent', form.hoursSpent);
      }
      if (form.githubLink && form.githubLink.trim()) {
        formData.append('githubLink', form.githubLink.trim());
      }
      const validResearchLinks = (form.researchLinks || [])
        .map((l) => l.trim())
        .filter(Boolean);
      if (validResearchLinks.length > 0) {
        formData.append('researchLinks', JSON.stringify(validResearchLinks));
      }
      if (attachment) {
        formData.append('attachment', attachment);
      }

      await api.post('/employee/daily-log/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMessage({ type: 'success', text: '✅ Daily log submitted successfully!' });
      setForm({
        hoursSpent: '',
        taskTitle: '',
        projectName: '',
        description: '',
        githubLink: '',
        researchLinks: [''],
      });
      setAttachment(null);
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
          <div className="card border-success-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle size={20} className="text-success-400" />
                <h2 className="font-semibold text-white">Today's Log Submitted</h2>
              </div>
              <span className="text-xs font-bold text-primary-400 bg-primary-500/10 border border-primary-500/30 px-2.5 py-1 rounded-full">
                {todayLog.hoursSpent}h Logged
              </span>
            </div>

            <div className="space-y-2 text-sm">
              {todayLog.taskTitle && (
                <div>
                  <p className="text-xs text-slate-400">Task Title</p>
                  <p className="text-white font-medium">{todayLog.taskTitle}</p>
                </div>
              )}
              {todayLog.projectName && (
                <div>
                  <p className="text-xs text-slate-400">Project Name</p>
                  <p className="text-white">{todayLog.projectName}</p>
                </div>
              )}
              {todayLog.description && (
                <div>
                  <p className="text-xs text-slate-400">Description</p>
                  <p className="text-slate-200 whitespace-pre-line text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                    {todayLog.description}
                  </p>
                </div>
              )}
              {todayLog.githubLink && (
                <div>
                  <p className="text-xs text-slate-400">GitHub Link</p>
                  <a
                    href={todayLog.githubLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-1.5 underline"
                  >
                    <ExternalLink size={12} /> {todayLog.githubLink}
                  </a>
                </div>
              )}
              {Array.isArray(todayLog.researchLinks) && todayLog.researchLinks.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Research Links</p>
                  <div className="space-y-1">
                    {todayLog.researchLinks.map((rLink, rIdx) => (
                      <a
                        key={rIdx}
                        href={rLink.startsWith('http') ? rLink : `https://${rLink}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-400 hover:text-primary-300 text-xs flex items-center gap-1.5 underline truncate"
                      >
                        <Link2 size={12} /> {rLink}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submission Form */}
        {!todayLog && (
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Submit Today's Log</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <DailyLogFields form={form} onChange={handleChange} errors={fieldErrors} />

              {/* Optional Hours Spent Override if submitting directly from this page */}
              <div>
                <label className="label text-xs">Hours Spent (optional)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  className="input text-sm"
                  placeholder="Leave empty to auto-calculate from active work hours"
                  value={form.hoursSpent}
                  onChange={(e) => handleChange('hoursSpent', e.target.value)}
                />
              </div>

              {/* File Attachment */}
              <div>
                <label className="label text-xs flex items-center gap-2">
                  <Paperclip size={14} /> Attachment (optional)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-500 cursor-pointer"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
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
                <div
                  key={log._id}
                  className="flex items-center justify-between py-2.5 border-b border-slate-700/60 last:border-0"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-white">{log.logDate}</p>
                    <p className="text-xs text-slate-400">
                      {log.taskTitle || log.projectName || 'Log submitted'}
                    </p>
                    {log.githubLink && (
                      <a
                        href={log.githubLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 underline"
                      >
                        <ExternalLink size={10} /> GitHub
                      </a>
                    )}
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

import { useState } from 'react';
import { X, FileText, Send, Loader2, AlertCircle } from 'lucide-react';
import DailyLogFields, { isValidGitHubUrl, isValidWebUrl } from '../DailyLogFields';
import api from '../../lib/api';

export default function DailyLogModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    taskTitle: '',
    projectName: '',
    description: '',
    githubLink: '',
    researchLinks: [''],
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
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
      setError('Please fix the highlighted fields before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        researchLinks: (form.researchLinks || []).map((l) => l.trim()).filter(Boolean),
      };
      const res = await api.post('/employee/daily-log/me', payload);
      const savedLog = res.data?.data?.log || payload;
      if (onSuccess) onSuccess(savedLog);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to submit daily log.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Submit Daily Log</h2>
              <p className="text-xs text-slate-400">Complete your daily summary to proceed to check-out</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-xs">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DailyLogFields form={form} onChange={handleChange} errors={fieldErrors} />

          <div className="pt-2">
            <button
              type="submit"
              id="submit-checkout-log-btn"
              disabled={submitting}
              className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? 'Saving Log...' : 'Submit Log & Proceed to Check Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

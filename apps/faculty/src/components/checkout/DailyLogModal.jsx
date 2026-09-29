import { useState } from 'react';
import { X, FileText, Send, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import DailyLogDocUpload from '../DailyLogDocUpload';
import api from '../../lib/api';

export default function DailyLogModal({ isOpen, onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setUploadError(null);

    if (!selectedFile) {
      setError('Please choose or drop a work document (up to 1MB) before checking out.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('document', selectedFile);

      const res = await api.post('/employee/daily-log/me', formData);

      const savedLog = res.data?.data?.log;
      if (onSuccess) onSuccess(savedLog);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to submit daily log.';
      setError(errMsg);
      setUploadError(errMsg);
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
              <h2 className="text-base font-bold text-white">Upload Daily Work Document</h2>
              <p className="text-xs text-slate-400">Upload your work document (within 1MB) to proceed to check-out</p>
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

          {/* Auto calculate hours banner */}
          <div className="flex items-center gap-2 p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300">
            <Sparkles size={14} className="text-violet-400 flex-shrink-0" />
            <span>Hours worked will be calculated automatically from your active shift duration.</span>
          </div>

          <DailyLogDocUpload
            file={selectedFile}
            onFileSelect={setSelectedFile}
            error={uploadError}
            setError={setUploadError}
            disabled={submitting}
          />

          <div className="pt-2">
            <button
              type="submit"
              id="submit-checkout-log-btn"
              disabled={submitting || !selectedFile}
              className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? 'Uploading & Unlocking...' : 'Submit Document & Proceed to Check Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, FileCheck } from 'lucide-react';

export const MAX_DOC_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const ALLOWED_DOC_EXTENSIONS = ['.doc', '.docx', '.pdf', '.txt', '.rtf', '.odt', '.xlsx', '.xls', '.csv'];

export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function DailyLogDocUpload({
  file,
  onFileSelect,
  error,
  setError,
  disabled = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;

    // Check file size (Strict 2MB limit)
    if (selectedFile.size > MAX_DOC_SIZE_BYTES) {
      const actualSizeMb = (selectedFile.size / (1024 * 1024)).toFixed(2);
      if (setError) {
        setError(`File size exceeds 2MB limit (Selected: ${actualSizeMb} MB). Please choose a file within 2 MB.`);
      }
      onFileSelect(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check extension
    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!ALLOWED_DOC_EXTENSIONS.includes(ext)) {
      if (setError) {
        setError(`Invalid document format. Allowed: ${ALLOWED_DOC_EXTENSIONS.join(', ')}`);
      }
      onFileSelect(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (setError) setError(null);
    onFileSelect(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onFileSelect(null);
    if (setError) setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Upload Zone */}
      {!file ? (
        <div
          id="daily-log-dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary-500 bg-primary-500/10 scale-[1.01]'
              : 'border-slate-700/80 hover:border-primary-500/50 bg-slate-800/30 hover:bg-slate-800/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="daily-log-file-input"
            accept=".doc,.docx,.pdf,.txt,.rtf,.odt,.xlsx,.xls,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
            onChange={handleInputChange}
            disabled={disabled}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 text-primary-400 flex items-center justify-center shadow-lg shadow-primary-500/10">
              <UploadCloud size={24} className="animate-pulse" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                Drop your work document here, or <span className="text-primary-400 underline">browse</span>
              </p>
              <p className="text-xs text-slate-400">
                Upload your completed work summary document for today
              </p>
            </div>

            {/* Restrictions Badge */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                Max size: <strong className="text-amber-400 font-semibold">2 MB</strong>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                DOCX, XLSX, PDF, CSV, TXT
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Selected File Card */
        <div className="p-4 rounded-2xl bg-slate-800/70 border border-primary-500/40 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500/20 to-violet-500/20 text-primary-400 flex items-center justify-center border border-primary-500/30 flex-shrink-0">
                <FileCheck size={22} className="text-primary-400" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-white truncate" title={file.name}>
                  {file.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-primary-300">{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={12} /> Within 2MB limit
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              id="clear-selected-doc-btn"
              onClick={handleRemove}
              disabled={disabled}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Remove document"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-xs">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, X, FileCheck } from 'lucide-react';

export const MAX_DOC_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
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

    // Check file size (Strict 1MB limit)
    if (selectedFile.size > MAX_DOC_SIZE_BYTES) {
      const actualSizeMb = (selectedFile.size / (1024 * 1024)).toFixed(2);
      if (setError) {
        setError(`File size exceeds 1MB limit (Selected: ${actualSizeMb} MB). Please choose a file within 1 MB.`);
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
          className={`relative border-2 border-dashed rounded-3xl p-7 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-violet-400 bg-violet-50/80 scale-[1.01] shadow-[0_10px_30px_-12px_rgba(139,92,246,0.5)]'
              : 'border-violet-200/80 hover:border-violet-300 bg-white/60 hover:bg-white/80'
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
            <div className="w-13 h-13 p-3.5 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center shadow-[0_6px_16px_-5px_rgba(139,92,246,0.5)]">
              <UploadCloud size={24} className="animate-pulse" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">
                Drop your work document here, or <span className="text-violet-500 underline decoration-violet-300">browse</span>
              </p>
              <p className="text-xs text-slate-400">
                Upload your completed work summary document for today
              </p>
            </div>

            {/* Restrictions Badge */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-white/90 border border-violet-100 text-slate-500 font-medium shadow-[0_2px_8px_-4px_rgba(148,163,184,0.4)]">
                Max size: <strong className="text-amber-500 font-semibold">2 MB</strong>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/90 border border-violet-100 text-slate-500 font-medium shadow-[0_2px_8px_-4px_rgba(148,163,184,0.4)]">
                DOCX, XLSX, PDF, CSV, TXT
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Selected File Card */
        <div className="p-4 rounded-3xl bg-white/80 border border-violet-100 shadow-[0_10px_28px_-12px_rgba(139,92,246,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(139,92,246,0.5)] flex-shrink-0">
                <FileCheck size={22} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-slate-800 truncate" title={file.name}>
                  {file.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-violet-500">{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span className="text-emerald-500 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={12} /> Within 1MB limit
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              id="clear-selected-doc-btn"
              onClick={handleRemove}
              disabled={disabled}
              className="p-1.5 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
              title="Remove document"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

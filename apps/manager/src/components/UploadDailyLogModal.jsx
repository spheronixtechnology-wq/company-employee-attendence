import React, { useState, useRef } from 'react';
import {
  X, Check, Clock, Folder, FileText, AlertCircle,
  UploadCloud, Paperclip, Trash2, Calendar, User,
  Sparkles, Loader2, LogIn, LogOut, Zap
} from 'lucide-react';
import api from '../lib/api';

const toTimeInputVal = (timeVal) => {
  if (!timeVal) return '';
  if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) return timeVal;
  try {
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
};

const calculateShiftHours = (inStr, outStr) => {
  if (!inStr || !outStr) return null;
  const [inH, inM] = inStr.split(':').map(Number);
  const [outH, outM] = outStr.split(':').map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return null;

  let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60; // Handles overnight shifts
  }

  const hours = totalMinutes / 60;
  const roundedHours = Math.round(hours * 10) / 10;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const durationText = m > 0 ? `${h}h ${m}m` : `${h}h`;

  return { roundedHours, durationText, totalMinutes };
};

const UploadDailyLogModal = ({ onClose, onSuccess, initialDate, targetUser, isEdit, existingLog }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const rawInitialCheckIn = toTimeInputVal(existingLog?.checkInTime || existingLog?.attendance?.checkInTime);
  const rawInitialCheckOut = toTimeInputVal(existingLog?.checkOutTime || existingLog?.attendance?.checkOutTime);
  const initialCalc = calculateShiftHours(rawInitialCheckIn, rawInitialCheckOut);

  const [form, setForm] = useState({
    checkInTime: rawInitialCheckIn,
    checkOutTime: rawInitialCheckOut,
    hoursSpent: existingLog?.hoursSpent !== undefined && existingLog?.hoursSpent !== null
      ? String(existingLog.hoursSpent)
      : (initialCalc ? String(initialCalc.roundedHours) : ''),
    taskTitle: existingLog?.taskTitle || '',
    projectName: existingLog?.projectName || '',
    description: existingLog?.description || '',
    blockers: existingLog?.blockers || '',
  });

  const [durationSnippet, setDurationSnippet] = useState(initialCalc ? initialCalc.durationText : null);
  const [isAutoCalculated, setIsAutoCalculated] = useState(Boolean(initialCalc));

  const [document, setDocument] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleTimeChange = (fieldName, val) => {
    const nextCheckIn = fieldName === 'checkInTime' ? val : form.checkInTime;
    const nextCheckOut = fieldName === 'checkOutTime' ? val : form.checkOutTime;

    let updatedHours = form.hoursSpent;
    let snippet = null;
    let autoCalc = false;

    if (nextCheckIn && nextCheckOut) {
      const calc = calculateShiftHours(nextCheckIn, nextCheckOut);
      if (calc) {
        updatedHours = String(calc.roundedHours);
        snippet = calc.durationText;
        autoCalc = true;
      }
    }

    setForm(prev => ({
      ...prev,
      [fieldName]: val,
      hoursSpent: updatedHours,
    }));
    setDurationSnippet(snippet);
    setIsAutoCalculated(autoCalc);
  };

  const handleHoursSpentChange = (e) => {
    setForm(prev => ({ ...prev, hoursSpent: e.target.value }));
    setIsAutoCalculated(false);
  };

  const handleFile = (e) => {
    if (e.target.files && e.target.files[0]) {
      setDocument(e.target.files[0]);
    }
  };

  const removeFile = (e) => {
    e.stopPropagation();
    setDocument(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formattedDate = initialDate
    ? new Date(initialDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Selected Date';

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.hoursSpent) return setError('Hours spent is required.');

    setLoading(true);
    setError(null);

    const formData = new FormData();
    if (!isEdit) {
      formData.append('userId', targetUser._id);
      formData.append('logDate', initialDate);
    }
    formData.append('hoursSpent', form.hoursSpent);
    if (form.checkInTime) formData.append('checkInTime', form.checkInTime);
    if (form.checkOutTime) formData.append('checkOutTime', form.checkOutTime);
    if (form.taskTitle) formData.append('taskTitle', form.taskTitle);
    if (form.projectName) formData.append('projectName', form.projectName);
    if (form.description) formData.append('description', form.description);
    if (form.blockers) formData.append('blockers', form.blockers);
    if (document) formData.append('document', document);

    try {
      if (isEdit) {
        await api.patch(`/manager/team/daily-log/${existingLog._id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/manager/team/daily-log', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit log.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Modal Container: strictly capped to max-h-[85vh] to guarantee full fit on laptop screens */}
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.9)] overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] animate-in zoom-in-95 duration-200">
        
        {/* Top Decorative Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 shrink-0" />

        {/* ── Sticky Header with Generous Spacing ── */}
        <div className="px-7 sm:px-8 pt-6 pb-5 border-b border-slate-100/90 flex items-center justify-between bg-white/90 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {/* Avatar with Glow & Ring */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-primary-600 text-white font-black text-lg flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/10 shrink-0">
              {targetUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {isEdit ? 'Edit Daily Log' : 'Upload Daily Log'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-violet-50 to-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs">
                  <Sparkles size={11} className="text-indigo-500" />
                  {isEdit ? 'Manager Edit' : 'New Entry'}
                </span>
              </div>

              {/* Subtitle with chips and clean spacing */}
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200/50 text-slate-800 font-bold text-[11px]">
                  <User size={12} className="text-indigo-600" />
                  {targetUser?.name}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200/50 text-slate-600 font-medium text-[11px]">
                  <Calendar size={12} className="text-slate-400" />
                  {formattedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Premium Circular Glass Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer flex items-center justify-center border border-slate-200/60 shadow-2xs hover:scale-105 active:scale-95 shrink-0"
            title="Close dialog"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Form Container with Scrollable Body ── */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Scrollable Form Body with generous padding */}
          <div className="flex-1 overflow-y-auto px-7 sm:px-8 py-6 space-y-5 custom-scrollbar">
            
            {error && (
              <div className="p-4 bg-rose-50/90 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Ultra-Premium Shift Timings & Working Hours Card ── */}
            <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-50/95 via-indigo-50/25 to-purple-50/20 rounded-2xl border border-indigo-100/90 shadow-[0_4px_20px_-4px_rgba(99,102,241,0.07),0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Clock size={13} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 truncate">
                    Shift Timing & Work Hours
                  </span>
                </div>
                {durationSnippet && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 border border-emerald-300/80 shadow-2xs shrink-0 animate-in fade-in">
                    <Sparkles size={11} className="text-emerald-500 fill-emerald-500" />
                    <span>{durationSnippet} duration</span>
                  </span>
                )}
              </div>

              {/* 2-Column Grid: Check-In & Check-Out Time Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Check In Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-500/20 shrink-0" />
                    <span>Check-In Time</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="time"
                      name="checkInTime"
                      value={form.checkInTime}
                      onChange={(e) => handleTimeChange('checkInTime', e.target.value)}
                      className="w-full text-sm font-mono font-black text-slate-900 bg-white/95 border border-slate-200/90 rounded-xl py-2.5 px-3.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] hover:border-emerald-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none transition-all cursor-pointer tracking-wider"
                    />
                  </div>
                </div>

                {/* Check Out Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-indigo-500/20 shrink-0" />
                    <span>Check-Out Time</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="time"
                      name="checkOutTime"
                      value={form.checkOutTime}
                      onChange={(e) => handleTimeChange('checkOutTime', e.target.value)}
                      className="w-full text-sm font-mono font-black text-slate-900 bg-white/95 border border-slate-200/90 rounded-xl py-2.5 px-3.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] hover:border-indigo-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all cursor-pointer tracking-wider"
                    />
                  </div>
                </div>
              </div>

              {/* Delicate Gradient Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-1" />

              {/* 2-Column Grid: Hours Spent & Project Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Hours Spent (Auto-calculated from Check-In/Out) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-violet-600 shrink-0" />
                      <span>Hours Spent <span className="text-rose-500">*</span></span>
                    </span>
                    {isAutoCalculated && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-violet-700 bg-violet-100/90 border border-violet-200/80 px-2 py-0.5 rounded-full shadow-2xs animate-in fade-in">
                        <Zap size={10} className="text-violet-600 fill-violet-600" />
                        Calculated
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="24"
                      name="hoursSpent"
                      value={form.hoursSpent}
                      onChange={handleHoursSpentChange}
                      className="w-full text-sm font-mono font-black text-slate-900 bg-white/95 border border-slate-200/90 rounded-xl py-2.5 px-3.5 pr-14 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] hover:border-violet-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 focus:outline-none transition-all tracking-wider"
                      placeholder="e.g. 8.0"
                      required
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200/80 pointer-events-none">
                      hrs
                    </span>
                  </div>
                </div>

                {/* Project Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Folder size={13} className="text-indigo-600 shrink-0" />
                    <span>Project Name</span>
                  </label>
                  <input
                    type="text"
                    name="projectName"
                    value={form.projectName}
                    onChange={handleChange}
                    className="w-full text-xs font-bold text-slate-900 bg-white/95 border border-slate-200/90 rounded-xl py-2.5 px-3.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] hover:border-indigo-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                    placeholder="e.g. Daily Log / Core App"
                  />
                </div>
              </div>
            </div>

            {/* Task / Update Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText size={13} className="text-primary-600" />
                <span>Task / Update Title</span>
              </label>
              <input
                type="text"
                name="taskTitle"
                value={form.taskTitle}
                onChange={handleChange}
                className="input text-xs py-2.5 px-3.5 text-slate-800 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
                placeholder="e.g. Frontend Architecture, Feature Delivery..."
              />
            </div>

            {/* Work Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Check size={13} className="text-emerald-600" />
                <span>Work Description</span>
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={2}
                className="input text-xs py-2.5 px-3.5 text-slate-800 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all resize-none"
                placeholder="Summary of accomplishments and work completed today..."
              />
            </div>

            {/* Blockers / Issues */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertCircle size={13} className="text-amber-500" />
                  <span>Blockers / Issues</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Optional</span>
              </label>
              <textarea
                name="blockers"
                value={form.blockers}
                onChange={handleChange}
                rows={2}
                className="input text-xs py-2.5 px-3.5 text-slate-800 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all resize-none"
                placeholder="Any impediments or blockers encountered today..."
              />
            </div>

            {/* Premium Document Upload Dropzone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Paperclip size={13} className="text-violet-600" />
                  <span>Attach Document</span>
                </span>
                <span className="text-[10px] text-slate-400">PDF, Word, Excel, CSV</span>
              </label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFile}
                className="hidden"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg"
              />

              {document ? (
                /* Selected File Pill */
                <div className="p-3 bg-violet-50/90 border border-violet-200 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{document.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{formatFileSize(document.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-100/80 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : existingLog?.documentName || existingLog?.documentUrl ? (
                /* Existing File Reminder + Dropzone */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3.5 rounded-2xl border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/30 hover:bg-violet-50/60 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full mb-0.5">
                          Current: {existingLog.documentName || 'Work Document'}
                        </span>
                        <p className="text-[11px] text-slate-500">Click to upload a new replacement document</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-violet-600 hover:underline shrink-0">Change</span>
                  </div>
                </div>
              ) : (
                /* Empty Dropzone */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-violet-400 bg-slate-50/50 hover:bg-violet-50/30 transition-all cursor-pointer text-center group"
                >
                  <UploadCloud size={24} className="mx-auto text-slate-400 group-hover:text-violet-600 transition-colors mb-1" />
                  <p className="text-xs font-bold text-slate-700 group-hover:text-violet-700 transition-colors">
                    Click to browse or drop file here
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Supports PDF, Word, Excel, CSV (up to 25MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Sticky Elevated Footer ── */}
          <div className="px-7 sm:px-8 py-4.5 bg-slate-50/95 backdrop-blur-md border-t border-slate-100/90 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              id="submit-daily-log-btn"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-md shadow-indigo-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{isEdit ? 'Updating...' : 'Uploading...'}</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>{isEdit ? 'Update Log' : 'Upload Log'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadDailyLogModal;

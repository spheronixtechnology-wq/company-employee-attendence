import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import api from '../lib/api';

const UploadDailyLogModal = ({ onClose, onSuccess, initialDate, targetUser, isEdit, existingLog }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    hoursSpent: existingLog?.hoursSpent || '',
    taskTitle: existingLog?.taskTitle || '',
    projectName: existingLog?.projectName || '',
    description: existingLog?.description || '',
    blockers: existingLog?.blockers || ''
  });
  
  const [document, setDocument] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleFile = (e) => setDocument(e.target.files[0]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
        
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit Daily Log' : 'Upload Daily Log'}</h2>
            <p className="text-sm text-slate-500 mt-1">
              For {targetUser.name} on {new Date(initialDate).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-5 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Hours Spent <span className="text-rose-500">*</span></label>
            <input type="number" step="0.5" name="hoursSpent" value={form.hoursSpent} onChange={handleChange} className="input" placeholder="e.g. 8.5" required />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Task / Update Title</label>
            <input type="text" name="taskTitle" value={form.taskTitle} onChange={handleChange} className="input" placeholder="e.g. Frontend Development or Document Name" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Project Name</label>
            <input type="text" name="projectName" value={form.projectName} onChange={handleChange} className="input" placeholder="e.g. Daily Log" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Work Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} className="input resize-none" rows="2" placeholder="Summary of tasks completed..." />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Blockers / Issues</label>
            <textarea name="blockers" value={form.blockers} onChange={handleChange} className="input resize-none" rows="2" placeholder="Any issues faced today?" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Log Document (PDF, Word, Excel, etc.)</label>
            <input type="file" onChange={handleFile} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100" />
          </div>

          <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-6 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
              {loading ? (isEdit ? 'Updating...' : 'Uploading...') : <><Check size={18} /> {isEdit ? 'Update Log' : 'Upload Log'}</>}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  );
};

export default UploadDailyLogModal;

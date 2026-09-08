import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  User, Mail, Phone, Briefcase, Users, Shield, Edit3,
  CheckCircle, AlertTriangle, Loader2, X, Save
} from 'lucide-react';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleEditClick = () => {
    setFormData({
      name: user?.name || '',
      phone: user?.phone || '',
      designation: user?.designation || '',
    });
    setMessage(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Full Name cannot be empty.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await api.put('/employee/profile', {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        designation: formData.designation.trim(),
      });

      const updatedUser = res.data?.data?.user;
      if (updatedUser) {
        setUser(updatedUser);
      }

      setMessage({ type: 'success', text: 'Profile details updated successfully!' });
      setIsEditing(false);
    } catch (err) {
      console.error('Update profile error:', err);
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update profile. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">View and update your personal employee information</p>
      </div>

      {/* Alert Feedback Banner */}
      {message && (
        <div
          className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="card border border-slate-700/60 bg-slate-800/90 shadow-xl overflow-hidden">
        {/* Header with Avatar */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 pb-6 border-b border-slate-700/60">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary-500/20 flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-bold text-white">{user?.name}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 capitalize">
                  {user?.role || 'employee'}
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">{user?.email}</p>
              {user?.designation && (
                <p className="text-slate-300 text-xs mt-1 font-medium flex items-center justify-center sm:justify-start gap-1">
                  <Briefcase size={12} className="text-slate-400" />
                  {user.designation}
                </p>
              )}
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={handleEditClick}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <Edit3 size={14} />
              Edit Details
            </button>
          )}
        </div>

        {/* Profile Content / Edit Form */}
        {!isEditing ? (
          <div className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <User size={13} className="text-primary-400" /> Full Name
                </div>
                <p className="text-white text-sm font-semibold">{user?.name || '—'}</p>
              </div>

              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Mail size={13} className="text-primary-400" /> Email Address
                </div>
                <p className="text-white text-sm font-semibold">{user?.email || '—'}</p>
              </div>

              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Phone size={13} className="text-primary-400" /> Contact Phone
                </div>
                <p className="text-white text-sm font-semibold">
                  {user?.phone ? user.phone : <span className="text-slate-500 font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Briefcase size={13} className="text-primary-400" /> Designation
                </div>
                <p className="text-white text-sm font-semibold">{user?.designation || 'Software Developer'}</p>
              </div>

              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Users size={13} className="text-primary-400" /> Team / Department
                </div>
                <p className="text-white text-sm font-semibold">{user?.teamId?.name || 'Technical'}</p>
              </div>

              <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Shield size={13} className="text-primary-400" /> Access Role
                </div>
                <p className="text-white text-sm font-semibold capitalize">{user?.role || 'Employee'}</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="pt-6 space-y-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your full name"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="input w-full"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used for urgent notifications and team contact.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Designation / Role Title
                </label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Software Developer"
                  className="input w-full"
                />
              </div>

              {/* Read-Only Notice */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs space-y-1 text-slate-400">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield size={13} className="text-amber-400" /> Company-Managed Details
                </p>
                <p>
                  <strong>Email:</strong> {user?.email} · <strong>Role:</strong> {user?.role} · <strong>Team:</strong> {user?.teamId?.name || 'Technical'}
                </p>
                <p className="text-slate-500 text-[11px]">
                  Email and team assignments are managed by administration.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="btn-ghost flex-1 flex items-center justify-center gap-1.5"
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {loading ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

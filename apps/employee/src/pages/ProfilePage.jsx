import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  User, Mail, Phone, Briefcase, Users, Shield, Edit3,
  CheckCircle, AlertTriangle, Loader2, X, Save, Camera,
  UploadCloud, Trash2
} from 'lucide-react';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  // Derive display ID from MongoDB _id (matches mobile 'EMP-001' pattern)
  const empDisplayId = user?.employeeId || null;
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || null);
  const [avatarError, setAvatarError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isEditing && user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        designation: user.designation || '',
      });
      setAvatarPreview(user.avatarUrl || null);
    }
  }, [user, isEditing]);

  const handleEditClick = () => {
    setFormData({
      name: user?.name || '',
      phone: user?.phone || '',
      designation: user?.designation || '',
    });
    setAvatarPreview(user?.avatarUrl || null);
    setAvatarError(null);
    setMessage(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setAvatarPreview(user?.avatarUrl || null);
    setAvatarError(null);
    setMessage(null);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Image is too large. Please select a photo under 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const rawBase64 = uploadEvent.target?.result;
      if (!rawBase64) return;

      // Compress and resize image using HTML5 canvas to keep Base64 payload lightweight (<150KB)
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 400; // 400x400 max dimension for avatar
          let { width, height } = img;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to Base64 JPEG data URL
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarPreview(compressedBase64);
          setAvatarError(null);
        } catch {
          setAvatarPreview(rawBase64);
          setAvatarError(null);
        }
      };
      img.onerror = () => {
        setAvatarPreview(rawBase64);
        setAvatarError(null);
      };
      img.src = rawBase64;
    };
    reader.onerror = () => {
      setAvatarError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setAvatarError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        avatarUrl: avatarPreview, // Base64 data URL or null
      });

      const updatedUser = res.data?.data?.user;
      if (updatedUser) {
        setUser(updatedUser);
      }

      setMessage({ type: 'success', text: 'Profile and photo updated successfully!' });
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
    <div className="relative page-container max-w-2xl mx-auto space-y-6 pb-12">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      <div>
        <h1 className="page-title text-slate-800">My Profile</h1>
        <p className="text-slate-400 text-sm mt-0.5">View and update your personal employee information</p>
      </div>

      {/* Alert Feedback Banner */}
      {message && (
        <div
          className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600'
              : 'bg-rose-50/80 border-rose-100 text-rose-600'
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
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] overflow-hidden">
        {/* Header with Avatar */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 pb-6 border-b border-violet-50">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="relative group">
              {isEditing ? (
                /* Editable Avatar Circle with Camera Overlay */
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-3xl overflow-hidden shadow-[0_12px_28px_-8px_rgba(99,102,241,0.6)] ring-4 ring-violet-400/80 focus:outline-hidden transition-transform active:scale-95"
                  title="Click to select a new profile photo"
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={formData.name || 'Profile'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sky-400 via-indigo-400 to-violet-500 flex items-center justify-center text-white text-3xl font-bold">
                      {formData.name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/45 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} />
                    <span className="text-[10px] font-semibold mt-0.5">Change</span>
                  </div>
                </button>
              ) : (
                /* Read-Only Avatar Display */
                <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-[0_12px_28px_-8px_rgba(99,102,241,0.6)] ring-4 ring-white flex-shrink-0">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sky-400 via-indigo-400 to-violet-500 flex items-center justify-center text-white text-3xl font-bold">
                      {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-[3px] border-white z-10"></span>
            </div>

            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-800">{isEditing ? formData.name || 'Your Name' : user?.name}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100/80 text-violet-600 capitalize">
                  {user?.role || 'employee'}
                </span>
                {empDisplayId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 font-mono tracking-wide">
                    ID: {empDisplayId}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm mt-0.5">{user?.email}</p>
              {(isEditing ? formData.designation || user?.designation : user?.designation) && (
                <p className="text-slate-500 text-xs mt-1 font-medium flex items-center justify-center sm:justify-start gap-1">
                  <Briefcase size={12} className="text-slate-400" />
                  {isEditing ? formData.designation : user?.designation}
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
              {empDisplayId && (
                <div className="p-3.5 bg-violet-50/60 rounded-2xl border border-violet-100 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                    <Shield size={13} className="text-violet-500" /> Employee ID
                  </div>
                  <p className="text-slate-800 text-sm font-bold font-mono tracking-wide">{empDisplayId}</p>
                </div>
              )}

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <User size={13} className="text-violet-500" /> Full Name
                </div>
                <p className="text-slate-800 text-sm font-semibold">{user?.name || '—'}</p>
              </div>

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Mail size={13} className="text-violet-500" /> Email Address
                </div>
                <p className="text-slate-800 text-sm font-semibold">{user?.email || '—'}</p>
              </div>

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Phone size={13} className="text-violet-500" /> Contact Phone
                </div>
                <p className="text-slate-800 text-sm font-semibold">
                  {user?.phone ? user.phone : <span className="text-slate-400 font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Briefcase size={13} className="text-violet-500" /> Designation
                </div>
                <p className="text-slate-800 text-sm font-semibold">{user?.designation || 'Software Developer'}</p>
              </div>

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Users size={13} className="text-violet-500" /> Team / Department
                </div>
                <p className="text-slate-800 text-sm font-semibold">{user?.teamId?.name || 'Technical'}</p>
              </div>

              <div className="p-3.5 bg-white/70 rounded-2xl border border-violet-50 shadow-[inset_0_2px_8px_-4px_rgba(148,163,184,0.3)]">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                  <Shield size={13} className="text-violet-500" /> Access Role
                </div>
                <p className="text-slate-800 text-sm font-semibold capitalize">{user?.role || 'Employee'}</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="pt-6 space-y-5">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg, image/webp"
              onChange={handleImageChange}
              className="hidden"
            />

            {/* Profile Photo Update Zone */}
            <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Camera size={14} className="text-violet-600" /> Profile Photo
                </span>
                <span className="text-[11px] text-slate-400">JPG, PNG, WebP (Max 10MB)</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-white border border-violet-200 text-xs font-semibold text-violet-700 hover:bg-violet-50/70 shadow-xs flex items-center gap-1.5 transition-all"
                >
                  <UploadCloud size={14} />
                  {avatarPreview ? 'Choose Different Photo' : 'Upload Profile Photo'}
                </button>

                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-100/70 shadow-xs flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 size={13} />
                    Remove Photo
                  </button>
                )}
              </div>

              {avatarError && (
                <p className="text-xs text-rose-600 font-medium flex items-center gap-1">
                  <AlertTriangle size={13} />
                  {avatarError}
                </p>
              )}

              <p className="text-[11px] text-slate-500">
                Photo will be automatically optimized and converted into a Base64 URL and displayed across your account.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
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
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="input w-full"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Used for urgent notifications and team contact.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
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
              <div className="p-3 rounded-2xl bg-violet-50/70 border border-violet-100 text-xs space-y-1 text-slate-500">
                <p className="font-semibold text-violet-700 flex items-center gap-1.5">
                  <Shield size={13} className="text-violet-500" /> Company-Managed Details
                </p>
                <p>
                  <strong>Email:</strong> {user?.email} · <strong>Role:</strong> {user?.role} · <strong>Team:</strong> {user?.teamId?.name || 'Technical'}
                </p>
                <p className="text-slate-400 text-[11px]">
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

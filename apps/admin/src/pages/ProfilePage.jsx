import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  UserCircle2, Camera, Save, Phone, Mail,
  Briefcase, Shield, Edit3, CheckCircle2,
  AlertTriangle, Loader2, Users
} from 'lucide-react';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [fileRef, setFileRef] = useState(null);
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 5 MB.' });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Name cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      let res;
      if (avatarFile) {
        const formData = new FormData();
        formData.append('name', form.name.trim());
        formData.append('phone', form.phone.trim());
        formData.append('designation', form.designation.trim());
        formData.append('avatar', avatarFile);

        res = await api.patch('/employee/profile', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        const payload = { ...form, avatarUrl: avatarPreview };
        res = await api.patch('/employee/profile', payload);
      }
      const updatedUser = res.data?.data?.user;
      if (updatedUser) setUser(updatedUser);
      setMessage({ type: 'success', text: 'Profile updated successfully \u2713' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save profile.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'A';

  return (
    <div className="page-container max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary-500/25">
          <UserCircle2 size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Profile</h1>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Update your personal info and profile photo.</p>
        </div>
      </div>

      {/* Notification */}
      {message && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {message.text}
        </div>
      )}

      {/* Avatar Card */}
      <div className="card bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] flex flex-col items-center gap-4">
        <div className="relative group">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt={user?.name}
              className="w-24 h-24 rounded-2xl object-cover ring-4 ring-primary-100 shadow-xl"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-primary-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white text-3xl font-black shadow-xl ring-4 ring-primary-100">
              {initials}
            </div>
          )}
          {/* Upload overlay */}
          <button
            onClick={() => fileRef?.click()}
            className="absolute inset-0 rounded-2xl bg-slate-900/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Camera size={20} className="text-white" />
            <span className="text-white text-[10px] font-bold">Change Photo</span>
          </button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={setFileRef}
            onChange={handleFileChange}
          />
        </div>

        <div className="text-center">
          <p className="font-black text-slate-900 text-lg">{user?.name}</p>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[11px] font-bold mt-1">
            <Shield size={11} /> Admin
          </span>
        </div>

        {avatarPreview !== user?.avatarUrl && (
          <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
            \u26a0 Unsaved photo \u2014 click Save to apply
          </p>
        )}
      </div>

      {/* Info Fields Card */}
      <div className="card bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] space-y-5">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <Edit3 size={15} className="text-primary-500" /> Personal Information
        </h2>

        {/* Editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <UserCircle2 size={12} /> Full Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
              placeholder="Your full name"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Phone size={12} /> Phone
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Designation */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Briefcase size={12} /> Designation
            </label>
            <input
              type="text"
              value={form.designation}
              onChange={e => setForm({ ...form, designation: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
              placeholder="e.g. Head of Operations"
            />
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Users size={12} /> Department
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed">
              Administration
            </div>
          </div>
        </div>

        {/* Read-only fields */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Mail size={12} /> Email
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed">
              {user?.email}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Shield size={12} /> Role
            </label>
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-medium cursor-not-allowed capitalize">
              {user?.role}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-bold rounded-xl shadow-md shadow-primary-500/25 transition-all active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

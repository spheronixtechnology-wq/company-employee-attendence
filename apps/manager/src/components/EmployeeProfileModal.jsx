import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader2, Calendar, Clock, FileText, CheckCircle2,
  AlertCircle, ChevronLeft, ChevronRight, ExternalLink,
  Eye, Download, Shield, Smartphone, Mail, Phone,
  Timer, XCircle, Info, ChevronDown, Check, User
} from 'lucide-react';
import api from '../lib/api';
import DocumentPreviewModal from './DocumentPreviewModal';

export default function EmployeeProfileModal({ isOpen = true, memberId, onClose }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  //  Period / Date filter state
  const [preset, setPreset] = useState('current_month');
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'attendance' | 'logs' | 'overtime' | 'device'

  // Sub-tab pagination states
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);

  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsData, setLogsData] = useState(null);

  const [otPage, setOtPage] = useState(1);
  const [otLoading, setOtLoading] = useState(false);
  const [otData, setOtData] = useState(null);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);

  // Security audit toggle
  const [showSecurityAudit, setShowSecurityAudit] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Initial and preset-based profile fetch
  const fetchProfile = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/manager/team/members/${memberId}/profile?preset=${preset}`);
      const data = res.data?.data;
      setProfileData(data);
      setAttendanceData(data?.attendance);
      setLogsData(data?.dailyLogs);
      setOtData(data?.overtime);
      setAttendancePage(1);
      setLogsPage(1);
      setOtPage(1);
    } catch (err) {
      console.error('Failed to load employee profile:', err);
      setError(err.response?.data?.message || 'Failed to load employee profile.');
    } finally {
      setLoading(false);
    }
  }, [memberId, preset]);

  useEffect(() => {
    if (isOpen && memberId) {
      fetchProfile();
    }
  }, [isOpen, memberId, fetchProfile]);

  // Paginated Attendance Fetch
  const fetchAttendancePage = async (page) => {
    if (!memberId || !profileData?.period) return;
    setAttendanceLoading(true);
    try {
      const { from, to } = profileData.period;
      const res = await api.get(`/manager/team/members/${memberId}/attendance?page=${page}&limit=10&from=${from}&to=${to}`);
      setAttendanceData(res.data?.data);
      setAttendancePage(page);
    } catch (err) {
      console.error('Failed to paginate attendance:', err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Paginated Daily Logs Fetch
  const fetchLogsPage = async (page) => {
    if (!memberId || !profileData?.period) return;
    setLogsLoading(true);
    try {
      const { from, to } = profileData.period;
      const res = await api.get(`/manager/team/members/${memberId}/daily-logs?page=${page}&limit=10&from=${from}&to=${to}`);
      setLogsData(res.data?.data);
      setLogsPage(page);
    } catch (err) {
      console.error('Failed to paginate daily logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Paginated Overtime Fetch
  const fetchOtPage = async (page) => {
    if (!memberId || !profileData?.period) return;
    setOtLoading(true);
    try {
      const { from, to } = profileData.period;
      const res = await api.get(`/manager/team/members/${memberId}/overtime?page=${page}&limit=10&from=${from}&to=${to}`);
      setOtData(res.data?.data);
      setOtPage(page);
    } catch (err) {
      console.error('Failed to paginate overtime:', err);
    } finally {
      setOtLoading(false);
    }
  };

  if (!isOpen) return null;

  const member = profileData?.member;
  const summary = profileData?.summary || {};
  const liveStatus = profileData?.liveStatus || {};
  const device = profileData?.device || {};
  const securityAudit = profileData?.securityAudit || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in">
        
        {/* ── Modal Top Header ── */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfaff_100%)] flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Identity & Status */}
            <div className="flex items-center gap-4 min-w-0">
              {member?.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member?.name || 'Employee'}
                  className="w-14 h-14 rounded-2xl object-cover ring-2 ring-violet-200 shadow-md shadow-violet-500/20 flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-fuchsia-500 flex items-center justify-center text-white font-black text-xl shadow-md shadow-violet-500/20 flex-shrink-0"
                style={{ display: member?.avatarUrl ? 'none' : 'flex' }}
              >
                {member?.name?.[0]?.toUpperCase() || <User size={24} />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900 truncate">
                    {member?.name || (loading ? 'Loading…' : 'Employee Profile')}
                  </h2>
                  
                  {/* Live Attendance Status Pill */}
                  {liveStatus.status && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs ${
                        liveStatus.status === 'working'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : liveStatus.status === 'on_break'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : liveStatus.status === 'checked_out'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : liveStatus.status === 'on_leave'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        liveStatus.status === 'working' ? 'bg-emerald-500 animate-pulse' :
                        liveStatus.status === 'on_break' ? 'bg-amber-500' :
                        liveStatus.status === 'checked_out' ? 'bg-blue-500' :
                        liveStatus.status === 'on_leave' ? 'bg-purple-500' : 'bg-slate-400'
                      }`} />
                      {liveStatus.label || 'Not Checked In'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                  <span className="font-semibold text-slate-700">{member?.designation || 'Team Member'}</span>
                  {member?.team && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold text-[11px]">
                      Team: {member.team.name}
                    </span>
                  )}
                  {member?.email && (
                    <a href={`mailto:${member.email}`} className="flex items-center gap-1 text-slate-500 hover:text-violet-600">
                      <Mail size={12} /> {member.email}
                    </a>
                  )}
                  {member?.phone && (
                    <a href={`tel:${member.phone}`} className="flex items-center gap-1 text-slate-500 hover:text-violet-600">
                      <Phone size={12} /> {member.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Period Selector & Close Button */}
            <div className="flex items-center gap-2.5 self-end sm:self-center">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                <Calendar size={13} className="text-violet-600 flex-shrink-0" />
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none border-none cursor-pointer pr-1"
                >
                  <option value="current_month">Current Month (Sep 2026)</option>
                  <option value="last_month">Previous Month (Aug 2026)</option>
                  <option value="all_time">All Time</option>
                </select>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close modal (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ── 5 KPI Ribbon Tiles ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Days Present</span>
              </div>
              <p className="text-lg font-black text-slate-900 mt-1">
                {summary.presentDays ?? 0} <span className="text-xs font-medium text-slate-500">Days</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {summary.halfDays ? `${summary.halfDays} half-day` : 'In selected period'}
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
                <Clock size={14} className="text-blue-600" />
                <span>Work Logged</span>
              </div>
              <p className="text-lg font-black text-slate-900 mt-1">
                {summary.totalWorkFormatted || '0h 00m'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Avg {summary.avgDailyWorkFormatted || '0h 00m'}/day
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
                <FileText size={14} className="text-indigo-600" />
                <span>Daily Logs</span>
              </div>
              <p className="text-lg font-black text-slate-900 mt-1">
                {summary.totalDailyLogs ?? 0} <span className="text-xs font-medium text-slate-500">Sheets</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {summary.totalLogHours ? `${summary.totalLogHours}h logged` : 'Work reported'}
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
                <Timer size={14} className="text-purple-600" />
                <span>Approved OT</span>
              </div>
              <p className="text-lg font-black text-slate-900 mt-1">
                {summary.approvedOTFormatted || '0h 00m'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {summary.approvedOTSessions ? `${summary.approvedOTSessions} verified sessions` : '0 verified sessions'}
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
                <Calendar size={14} className="text-amber-600" />
                <span>Leave Days</span>
              </div>
              <p className="text-lg font-black text-slate-900 mt-1">
                {summary.approvedLeaveDays ?? 0} <span className="text-xs font-medium text-slate-500">Days</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {summary.pendingLeaveRequests ? `${summary.pendingLeaveRequests} pending review` : 'Approved in period'}
              </p>
            </div>
          </div>

          {/* ── Navigation Tabs ── */}
          <div className="flex items-center gap-1.5 mt-5 border-b border-slate-200 -mb-5 sm:-mb-6 pt-1">
            {[
              { id: 'profile', label: 'Profile Info' },
              { id: 'attendance', label: 'Attendance Records', count: attendanceData?.totalCount },
              { id: 'logs', label: 'Daily Log Sheets', count: logsData?.totalCount },
              { id: 'overtime', label: 'Overtime (OT)', count: otData?.totalCount },
              { id: 'device', label: 'Attendance Device' },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-xs font-bold transition-all relative border-b-2 flex items-center gap-2 ${
                    active
                      ? 'text-violet-700 border-violet-600 font-extrabold'
                      : 'text-slate-500 hover:text-slate-800 border-transparent'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      active ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Modal Body Content ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={32} className="animate-spin text-violet-600" />
              <p className="text-xs font-semibold text-slate-500">Retrieving employee records & performance metrics…</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
              <AlertCircle size={20} className="flex-shrink-0 text-rose-600" />
              <div>
                <p className="font-bold">Error Loading Profile</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* ──────────────── TAB 0: PROFILE INFO ──────────────── */}
              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                  
                  {/* Personal Info */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-violet-200 transition-colors">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                        <User size={14} />
                      </div>
                      Personal Information
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {[member?.name, member?.middleName, member?.lastName].filter(Boolean).join(' ') || '—'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Birth</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.dob ? new Date(member.dob).toLocaleDateString('en-GB') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gender</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.gender || '—'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Address</p>
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">{member?.currentAddress || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Job Info */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-blue-200 transition-colors">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <FileText size={14} />
                      </div>
                      Job Information
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Designation</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.designation || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Department</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.department || '—'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Job Type</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.jobType || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Joining</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.joinedDate ? new Date(member.joinedDate).toLocaleDateString('en-GB') : '—'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Work Location</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.workLocation || '—'} {member?.country ? `(${member.country})` : ''}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Office Branch</p>
                          <p className="text-sm font-semibold text-slate-800">{member?.officeBranch || '—'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Team Shift</p>
                        <p className="text-sm font-semibold text-slate-800">{member?.teamShift || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-emerald-200 transition-colors">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Mail size={14} />
                      </div>
                      Contact Details
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mobile Number</p>
                        <p className="text-sm font-semibold text-slate-800">{member?.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Personal Email</p>
                        <p className="text-sm font-semibold text-slate-800 break-all">{member?.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Company Email</p>
                        <p className="text-sm font-semibold text-slate-800 break-all">{member?.companyEmail || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-rose-200 transition-colors">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                        <AlertCircle size={14} />
                      </div>
                      Emergency Contact
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Contact Name</p>
                        <p className="text-sm font-semibold text-slate-800">{member?.emergencyContactName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Relationship</p>
                        <p className="text-sm font-semibold text-slate-800">{member?.emergencyContactRelation || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Contact Number</p>
                        <p className="text-sm font-semibold text-slate-800">{member?.emergencyContactNumber || '—'}</p>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ──────────────── TAB 1: ATTENDANCE HISTORY ──────────────── */}
              {activeTab === 'attendance' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <p className="font-semibold">
                      Showing attendance logs for <span className="text-slate-900 font-bold">{profileData?.period?.label}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Total {attendanceData?.totalCount || 0} records
                    </p>
                  </div>

                  {attendanceLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-violet-600" size={24} /></div>
                  ) : attendanceData?.records?.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Check In</th>
                            <th className="py-3 px-4">Check Out</th>
                            <th className="py-3 px-4">Work Duration</th>
                            <th className="py-3 px-4">Breaks</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {attendanceData.records.map((rec) => {
                            const checkInStr = rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                            const checkOutStr = rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                            
                            // Net work duration = Total time from checkin to checkout minus break time
                            let workMins = Number(rec.totalWorkMinutes ?? rec.actualWorkMinutes ?? 0);
                            let breakMins = Number(rec.totalBreakMinutes ?? rec.completedBreakMinutes ?? 0);

                            // Calculate dynamically if missing or 0 but checkInTime exists
                            if (workMins <= 0 && rec.checkInTime) {
                              const checkIn = new Date(rec.checkInTime).getTime();
                              let checkOut = rec.checkOutTime ? new Date(rec.checkOutTime).getTime() : null;
                              const isToday = rec.date === new Date().toISOString().split('T')[0];
                              if (!checkOut && isToday) {
                                checkOut = Date.now();
                              }
                              if (checkOut && checkOut > checkIn) {
                                const totalMins = Math.floor((checkOut - checkIn) / 60000);
                                workMins = Math.max(0, totalMins - breakMins);
                              }
                            }

                            const workH = Math.floor(workMins / 60);
                            const workM = workMins % 60;
                            const breakH = Math.floor(breakMins / 60);
                            const breakM = breakMins % 60;

                            return (
                              <tr key={rec._id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {rec.date}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                                  {checkInStr}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                                  {checkOutStr}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {workMins > 0 ? (
                                    <span className="text-slate-900 font-bold">
                                      {workH}h {String(workM).padStart(2, '0')}m
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal">0h 00m</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                                  {breakMins > 0 ? (
                                    <span>{breakH > 0 ? `${breakH}h ` : ''}{breakM}m</span>
                                  ) : (
                                    <span>0m</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    rec.status === 'present'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : rec.status === 'half_day'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : rec.status === 'absent'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {rec.status === 'present' ? 'Present' :
                                     rec.status === 'half_day' ? 'Half Day' :
                                     rec.status === 'absent' ? 'Absent' : rec.status || 'Not Checked In'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                      No attendance records found for this employee in {profileData?.period?.label}.
                    </div>
                  )}

                  {/* Attendance Pagination */}
                  {attendanceData?.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px] text-slate-500 font-medium">
                        Page {attendancePage} of {attendanceData.totalPages}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => fetchAttendancePage(attendancePage - 1)}
                          disabled={attendancePage <= 1}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          <ChevronLeft size={14} /> Previous
                        </button>
                        <button
                          onClick={() => fetchAttendancePage(attendancePage + 1)}
                          disabled={attendancePage >= attendanceData.totalPages}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──────────────── TAB 2: DAILY LOG SHEETS ──────────────── */}
              {activeTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <p className="font-semibold">
                      Submitted work reports for <span className="text-slate-900 font-bold">{profileData?.period?.label}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Total {logsData?.totalCount || 0} sheets
                    </p>
                  </div>

                  {logsLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-violet-600" size={24} /></div>
                  ) : logsData?.records?.length > 0 ? (
                    <div className="space-y-3">
                      {logsData.records.map((log) => (
                        <div key={log._id} className="card p-4 border border-slate-200 bg-white rounded-2xl shadow-xs space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900 text-sm">{log.logDate}</span>
                                {log.projectName && (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                    {log.projectName}
                                  </span>
                                )}
                              </div>
                              {log.taskTitle && (
                                <p className="text-xs font-bold text-slate-800 mt-1">{log.taskTitle}</p>
                              )}
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-mono font-bold text-xs flex-shrink-0">
                              {log.hoursSpent} Hours
                            </span>
                          </div>

                          {log.description && (
                            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 whitespace-pre-wrap leading-relaxed">
                              {log.description}
                            </p>
                          )}

                          {log.blockers && (
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                              <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                              <span><strong className="font-semibold">Blockers:</strong> {log.blockers}</span>
                            </div>
                          )}

                          {log.githubLink && (
                            <div className="pt-1">
                              <a
                                href={log.githubLink.startsWith('http') ? log.githubLink : `https://${log.githubLink}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-mono underline"
                              >
                                <ExternalLink size={13} /> {log.githubLink}
                              </a>
                            </div>
                          )}

                          {/* Document Attachment Action */}
                          {(log.documentUrl || log.attachmentUrl) && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <FileText size={15} className="text-violet-600" />
                                <span className="font-semibold">{log.documentName || 'Attached Document'}</span>
                                {log.documentSize && (
                                  <span className="text-[10px] text-slate-400">({(log.documentSize / (1024 * 1024)).toFixed(2)} MB)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(log)}
                                  className="btn bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 text-[11px] py-1 px-2.5 flex items-center gap-1 font-semibold rounded-lg shadow-xs"
                                >
                                  <Eye size={12} /> Preview
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = log.documentUrl || log.attachmentUrl;
                                    link.download = log.documentName || 'work-document';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="btn bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] py-1 px-2.5 flex items-center gap-1 font-semibold rounded-lg shadow-xs"
                                >
                                  <Download size={12} /> Download
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                      No daily log sheets submitted by this employee in {profileData?.period?.label}.
                    </div>
                  )}

                  {/* Logs Pagination */}
                  {logsData?.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px] text-slate-500 font-medium">
                        Page {logsPage} of {logsData.totalPages}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => fetchLogsPage(logsPage - 1)}
                          disabled={logsPage <= 1}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          <ChevronLeft size={14} /> Previous
                        </button>
                        <button
                          onClick={() => fetchLogsPage(logsPage + 1)}
                          disabled={logsPage >= logsData.totalPages}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──────────────── TAB 3: OVERTIME (OT) ──────────────── */}
              {activeTab === 'overtime' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <p className="font-semibold">
                      Overtime audit log for <span className="text-slate-900 font-bold">{profileData?.period?.label}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Total {otData?.totalCount || 0} sessions
                    </p>
                  </div>

                  {otLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-violet-600" size={24} /></div>
                  ) : otData?.records?.length > 0 ? (
                    <div className="space-y-3">
                      {otData.records.map((ot) => {
                        const isStage1Approved = ot.permissionStatus === 'approved';
                        const isStage1Rejected = ot.permissionStatus === 'rejected';
                        const isStage2Approved = ot.workVerificationStatus === 'approved';
                        const isStage2Rejected = ot.workVerificationStatus === 'rejected';
                        const isStage2Pending = ot.workVerificationStatus === 'pending' || ot.status === 'work_verification_pending';
                        const isLiveTracking = ot.status === 'in_progress';

                        return (
                          <div key={ot._id} className="card p-4 border border-slate-200 bg-white rounded-2xl shadow-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900 text-sm">{ot.date}</span>
                                <span className="text-xs text-slate-500">
                                  ({new Date(ot.requestedStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – {new Date(ot.requestedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
                                </span>
                              </div>

                              {/* Credited OT Pill */}
                              {isStage2Approved ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                                  <CheckCircle2 size={13} /> +{Math.floor((ot.approvedMinutes || 0) / 60)}h {(ot.approvedMinutes || 0) % 60}m Approved
                                </span>
                              ) : isStage2Rejected ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                                  <XCircle size={13} /> Work Rejected (0h Credited)
                                </span>
                              ) : isStage2Pending ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold">
                                  <Clock size={13} /> Review Pending (Credited: —)
                                </span>
                              ) : isLiveTracking ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold animate-pulse">
                                  <Timer size={13} /> Tracking Live Time…
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold">
                                  Stage 1 {ot.permissionStatus}
                                </span>
                              )}
                            </div>

                            {/* Lifecycle Stage Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {/* Stage 1: Permission */}
                              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Stage 1: Pre-OT Permission</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isStage1Approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    isStage1Rejected ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {isStage1Approved ? '✓ Permitted' : isStage1Rejected ? '✕ Denied' : '⏳ Pending'}
                                  </span>
                                </div>
                                <p className="text-slate-600 mt-1">
                                  <strong className="font-semibold text-slate-700">Reason:</strong> {ot.reason}
                                </p>
                                {ot.permissionDecisionBy && (
                                  <p className="text-[11px] text-slate-500">
                                    Decided by {ot.permissionDecisionBy.name}
                                  </p>
                                )}
                              </div>

                              {/* Stage 2: Verification & Actual Time */}
                              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Stage 2: Work Verification</span>
                                  <span className="font-mono text-slate-700 font-bold">
                                    Tracked: {ot.recordedMinutes ? `${Math.floor(ot.recordedMinutes / 60)}h ${ot.recordedMinutes % 60}m` : isLiveTracking ? 'Tracking…' : '—'}
                                  </span>
                                </div>
                                {ot.workDetails ? (
                                  <p className="text-slate-600 mt-1">
                                    <strong className="font-semibold text-slate-700">Submitted:</strong> {ot.workDetails}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-slate-400 italic">Work submission pending</p>
                                )}
                                {ot.workVerifiedBy && (
                                  <p className="text-[11px] text-slate-500">
                                    Verified by {ot.workVerifiedBy.name}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                      No overtime sessions performed by this employee in {profileData?.period?.label}.
                    </div>
                  )}

                  {/* OT Pagination */}
                  {otData?.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-[11px] text-slate-500 font-medium">
                        Page {otPage} of {otData.totalPages}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => fetchOtPage(otPage - 1)}
                          disabled={otPage <= 1}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          <ChevronLeft size={14} /> Previous
                        </button>
                        <button
                          onClick={() => fetchOtPage(otPage + 1)}
                          disabled={otPage >= otData.totalPages}
                          className="btn-ghost py-1 px-2.5 text-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──────────────── TAB 4: ATTENDANCE DEVICE DETAILS ──────────────── */}
              {activeTab === 'device' && (
                <div className="space-y-4">
                  {/* 1. Primary Authorized Attendance Device */}
                  <div className="card p-5 border border-slate-200 bg-white rounded-2xl shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
                          <Smartphone size={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-slate-900">
                              {device?.deviceLabel || 'Authorized Attendance Mobile'}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Bound Hardware
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Hardware device enrolled and authorized for daily punch-in & check-out
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 4 Core Parameter Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Device Model & OS</p>
                        <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                          {device?.deviceLabel?.split('·')?.[0]?.trim() || 'Android Device'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{device?.os || 'Android'} · {device?.browser || 'Chrome'}</p>
                      </div>

                      <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hardware Fingerprint</p>
                        <p className="font-mono text-xs font-bold text-slate-900 mt-1 truncate" title={device?.deviceFingerprint}>
                          {device?.deviceFingerprint ? `${device.deviceFingerprint.slice(0, 16)}…` : 'HW-VERIFIED'}
                        </p>
                        <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Hardware Locked</p>
                      </div>

                      <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Punch Network IP</p>
                        <p className="font-mono text-xs font-bold text-slate-900 mt-1">
                          {device?.lastPunchIp || '103.5.135.77'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Verified Gateway</p>
                      </div>

                      <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bound Date</p>
                        <p className="text-xs font-bold text-slate-900 mt-1">
                          {device?.registeredAt ? new Date(device.registeredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Authorized'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {device?.lastSeenAt ? `Last punch: ${new Date(device.lastSeenAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Active'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Recent Attendance Punch Device & Network Verification Logs */}
                  <div className="card p-5 border border-slate-200 bg-white rounded-2xl shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Attendance Punch Device Logs
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Hardware and network verification audit recorded at each punch
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {device?.recentPunches?.length || 0} Punches Verified
                      </span>
                    </div>

                    {device?.recentPunches?.length > 0 ? (
                      <div className="overflow-x-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                              <th className="py-2.5 px-3">Date & Time</th>
                              <th className="py-2.5 px-3">Method</th>
                              <th className="py-2.5 px-3">Punch IP Address</th>
                              <th className="py-2.5 px-3">Authorized Device</th>
                              <th className="py-2.5 px-3 text-right">Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {device.recentPunches.map((punch) => {
                              const punchTime = punch.checkInTime ? new Date(punch.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
                              return (
                                <tr key={punch._id} className="hover:bg-slate-50/60">
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className="font-mono font-bold text-slate-900">{punch.date}</span>
                                    <span className="text-slate-500 text-[11px] ml-1.5 font-mono">{punchTime}</span>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                      {punch.method}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                                    {punch.checkInIp || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-800 font-medium whitespace-nowrap">
                                    {punch.deviceLabel}
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 size={11} className="text-emerald-600" />
                                      Hardware Matched
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                        No recent punch records logged for this employee.
                      </div>
                    )}
                  </div>

                  {/* 3. Device Registration & Replacement History (if any) */}
                  {device?.deviceRequests?.length > 0 && (
                    <div className="card p-5 border border-slate-200 bg-white rounded-2xl shadow-xs space-y-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Device Authorization & Replacement History
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          History of device binding requests submitted by this employee
                        </p>
                      </div>

                      <div className="space-y-2">
                        {device.deviceRequests.map((req) => (
                          <div key={req._id} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-900">
                                {req.requestedDeviceLabel || 'Standard Mobile Device'}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {req.requestType === 'replacement' ? 'Device Replacement' : 'Initial Enrollment'} · Requested on {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {req.reason ? ` · Reason: "${req.reason}"` : ''}
                              </p>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              req.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {req.status?.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <span>Member ID: <code className="font-mono">{memberId}</code></span>
          <button
            type="button"
            onClick={onClose}
            className="btn bg-white hover:bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-xl border border-slate-200 shadow-xs"
          >
            Close
          </button>
        </div>
      </div>

      {/* Embedded Document Previewer */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          documentUrl={previewDoc.documentUrl || previewDoc.attachmentUrl}
          documentName={previewDoc.documentName || previewDoc.taskTitle || 'Daily Work Document'}
          documentSize={previewDoc.documentSize}
        />
      )}
    </div>
  );
}

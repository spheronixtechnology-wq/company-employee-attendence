import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import {
  Users, Plus, Search, Loader2, UserCheck, UserX, Pencil, X, Eye, EyeOff,
  LayoutGrid, List, Mail, Phone, Clock, Coffee, CheckCircle2,
  Calendar, ChevronRight, Filter, Smartphone
} from 'lucide-react';
import EmployeeProfileModal from '../components/EmployeeProfileModal';
import EmployeeCreationModal from '../components/EmployeeCreationModal';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'working' | 'on_break' | 'checked_out' | 'offline' | 'inactive'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  const [showCreationModal, setShowCreationModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', teamId: '', designation: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const fetchData = async () => {
    try {
      const [empRes, teamRes] = await Promise.all([
        api.get(`/admin/employees?search=${encodeURIComponent(search)}`),
        api.get('/admin/teams'),
      ]);
      setEmployees(empRes.data?.data?.employees || []);
      setTeams(teamRes.data?.data?.teams || []);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search]);

  // Client-side filtering for team, role, and live status
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Team filter
      if (teamFilter !== 'all') {
        const empTeamId = emp.teamId?._id || emp.teamId;
        if (empTeamId !== teamFilter) return false;
      }
      // Role filter
      if (roleFilter !== 'all' && emp.role !== roleFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === 'working' && emp.currentStatus !== 'working') return false;
      if (statusFilter === 'on_break' && emp.currentStatus !== 'on_break') return false;
      if (statusFilter === 'checked_out' && emp.currentStatus !== 'checked_out') return false;
      if (statusFilter === 'on_leave' && emp.currentStatus !== 'on_leave') return false;
      if (statusFilter === 'offline' && emp.currentStatus !== 'not_checked_in') return false;
      if (statusFilter === 'inactive' && emp.isActive) return false;
      if (statusFilter === 'active' && !emp.isActive) return false;

      return true;
    });
  }, [employees, teamFilter, roleFilter, statusFilter]);

  // Real-time status counters
  const stats = useMemo(() => {
    const total = employees.length;
    const working = employees.filter(e => e.currentStatus === 'working').length;
    const onBreak = employees.filter(e => e.currentStatus === 'on_break').length;
    const checkedOut = employees.filter(e => e.currentStatus === 'checked_out').length;
    const onLeave = employees.filter(e => e.currentStatus === 'on_leave').length;
    return { total, working, onBreak, checkedOut, onLeave };
  }, [employees]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (editUser) {
        await api.patch(`/admin/users/${editUser._id}`, form);
        setMessage({ type: 'success', text: 'User updated successfully.' });
      } else {
        await api.post('/admin/users', form);
        setMessage({ type: 'success', text: 'User created successfully.' });
      }
      setShowEditForm(false);
      setEditUser(null);
      setShowPassword(false);
      setForm({ name: '', email: '', password: '', role: 'employee', teamId: '', designation: '', phone: '' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Operation failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (user, e) => {
    if (e) e.stopPropagation();
    try {
      await api.patch(`/admin/users/${user._id}`, { isActive: !user.isActive });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update user status.' });
    }
  };

  const openEdit = (user, e) => {
    if (e) e.stopPropagation();
    setEditUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      teamId: user.teamId?._id || user.teamId || '',
      designation: user.designation || '',
      phone: user.phone || '',
    });
    setShowPassword(false);
    setShowEditForm(true);
  };

  const getStatusBadge = (emp) => {
    if (!emp.isActive) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          Inactive
        </span>
      );
    }
    if (emp.currentStatus === 'working') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Working
        </span>
      );
    }
    if (emp.currentStatus === 'on_break') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
          <Coffee size={11} className="text-amber-600" />
          On Break
        </span>
      );
    }
    if (emp.currentStatus === 'checked_out') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
          <CheckCircle2 size={11} className="text-blue-600" />
          Checked Out
        </span>
      );
    }
    if (emp.currentStatus === 'on_leave') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shadow-xs">
          <Calendar size={11} className="text-purple-600" />
          On Leave
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
        Offline
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-200 shadow-xs">
              <Users size={20} />
            </div>
            Employees Directory
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Organization-wide employee management, live attendance status, and 360° audit records
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle (Grid vs Table) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-violet-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-violet-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table List View"
            >
              <List size={15} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <button
            id="add-user-btn"
            onClick={() => setShowCreationModal(true)}
            className="btn bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2 rounded-xl shadow-sm shadow-violet-500/20 flex items-center gap-2 text-xs"
          >
            <Plus size={16} /> Add User
          </button>
        </div>
      </div>

      {/* ── Status Ribbon KPI Tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('all')}
          className={`card p-3.5 border rounded-2xl cursor-pointer transition-all ${
            statusFilter === 'all'
              ? 'border-violet-300 bg-violet-50/50 shadow-xs ring-2 ring-violet-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Users size={14} className="text-violet-600" />
            <span>Total Members</span>
          </div>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.total}</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'working' ? 'all' : 'working')}
          className={`card p-3.5 border rounded-2xl cursor-pointer transition-all ${
            statusFilter === 'working'
              ? 'border-emerald-300 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Working Now</span>
          </div>
          <p className="text-xl font-black text-emerald-700 mt-1">{stats.working}</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'on_break' ? 'all' : 'on_break')}
          className={`card p-3.5 border rounded-2xl cursor-pointer transition-all ${
            statusFilter === 'on_break'
              ? 'border-amber-300 bg-amber-50/50 shadow-xs ring-2 ring-amber-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Coffee size={14} className="text-amber-600" />
            <span>On Break</span>
          </div>
          <p className="text-xl font-black text-amber-700 mt-1">{stats.onBreak}</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'checked_out' ? 'all' : 'checked_out')}
          className={`card p-3.5 border rounded-2xl cursor-pointer transition-all ${
            statusFilter === 'checked_out'
              ? 'border-blue-300 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <CheckCircle2 size={14} className="text-blue-600" />
            <span>Checked Out</span>
          </div>
          <p className="text-xl font-black text-blue-700 mt-1">{stats.checkedOut}</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'on_leave' ? 'all' : 'on_leave')}
          className={`card p-3.5 border rounded-2xl cursor-pointer transition-all col-span-2 sm:col-span-1 ${
            statusFilter === 'on_leave'
              ? 'border-purple-300 bg-purple-50/50 shadow-xs ring-2 ring-purple-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Calendar size={14} className="text-purple-600" />
            <span>On Leave</span>
          </div>
          <p className="text-xl font-black text-purple-700 mt-1">{stats.onLeave}</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-semibold ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={14} /></button>
        </div>
      )}

      {/* ── Search & Filter Controls Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:bg-white transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Team Filter */}
        <div className="flex items-center gap-2">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 cursor-pointer"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="employee">Employees</option>
            <option value="manager">Managers</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="working">Working Now</option>
            <option value="on_break">On Break</option>
            <option value="checked_out">Checked Out</option>
            <option value="on_leave">On Leave</option>
            <option value="offline">Offline</option>
            <option value="inactive">Inactive Accounts</option>
          </select>
        </div>
      </div>

      {/* ── Content View (Grid vs Table) ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-violet-600 mb-2" size={32} />
          <p className="text-xs text-slate-400">Loading organization employees…</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
          <Users size={32} className="text-slate-400 mx-auto mb-2" />
          <p className="text-slate-700 font-bold text-sm">No employees match your search criteria</p>
          <p className="text-slate-400 text-xs mt-0.5">Try resetting search filters or add a new team member.</p>
          {(search || teamFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setTeamFilter('all');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
              className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-700 underline"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ══════════════ GRID CARD VIEW ══════════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredEmployees.map((emp) => {
            const checkInTime = emp.todayAttendance?.checkInTime
              ? new Date(emp.todayAttendance.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : null;
            const checkInMethod = emp.todayAttendance?.checkInMethod
              ? emp.todayAttendance.checkInMethod.replace('_', ' ').toUpperCase()
              : 'QR CODE';

            return (
              <div
                key={emp._id}
                onClick={() => setSelectedMemberId(emp._id)}
                className="card relative overflow-hidden flex flex-col justify-between border border-slate-200 hover:border-violet-300 hover:shadow-lg transition-all duration-200 cursor-pointer group hover:-translate-y-1 bg-white rounded-2xl p-5 shadow-xs"
              >
                <div>
                  {/* Card Header: Avatar, Name & Live Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        {emp.avatarUrl ? (
                          <img
                            src={emp.avatarUrl}
                            alt={emp.name}
                            className="w-12 h-12 rounded-2xl object-cover shadow-sm ring-2 ring-violet-200 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-fuchsia-500 flex items-center justify-center text-white font-black text-lg shadow-sm shadow-violet-500/20 group-hover:scale-105 transition-transform">
                            {emp.name?.[0]?.toUpperCase()}
                          </div>
                        )}
                        {emp.isActive && (
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            emp.currentStatus === 'working' ? 'bg-emerald-500 animate-pulse' :
                            emp.currentStatus === 'on_break' ? 'bg-amber-500' :
                            emp.currentStatus === 'checked_out' ? 'bg-blue-500' :
                            emp.currentStatus === 'on_leave' ? 'bg-purple-500' : 'bg-slate-300'
                          }`} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 truncate group-hover:text-violet-600 transition-colors leading-tight">
                          {emp.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {emp.designation || 'Team Member'}
                        </p>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {getStatusBadge(emp)}
                    </div>
                  </div>

                  {/* Team & Role Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                    <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold">
                      Team: {emp.teamId?.name || 'Unassigned'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      emp.role === 'manager'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {emp.role?.toUpperCase()}
                    </span>
                  </div>

                  {/* Today's Punch Information */}
                  <div className="mt-3.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Today's Punch</span>
                      {checkInTime ? (
                        <span className="font-mono font-bold text-slate-800">
                          {checkInTime} <span className="text-[10px] text-violet-600 font-normal">({checkInMethod})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not clocked in</span>
                      )}
                    </div>
                  </div>

                  {/* Contact Row */}
                  <div className="space-y-1 mt-3 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone size={12} className="text-slate-400 flex-shrink-0" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-violet-600 group-hover:text-violet-700 flex items-center gap-1">
                    View 360° Profile <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => openEdit(emp, e)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                      title="Edit User"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => toggleActive(emp, e)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        emp.isActive
                          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={emp.isActive ? 'Deactivate User' : 'Activate User'}
                    >
                      {emp.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ══════════════ TABLE LIST VIEW ══════════════ */
        <div className="card overflow-hidden p-0 border border-slate-200 bg-white rounded-2xl shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Live Status</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Today's Punch</th>
                  <th className="py-3 px-4">Contact Email</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const checkInTime = emp.todayAttendance?.checkInTime
                    ? new Date(emp.todayAttendance.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  const checkInMethod = emp.todayAttendance?.checkInMethod
                    ? emp.todayAttendance.checkInMethod.replace('_', ' ').toUpperCase()
                    : 'QR CODE';

                  return (
                    <tr
                      key={emp._id}
                      onClick={() => setSelectedMemberId(emp._id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {emp.avatarUrl ? (
                            <img
                              src={emp.avatarUrl}
                              alt={emp.name}
                              className="w-8 h-8 rounded-xl object-cover shadow-xs ring-1 ring-violet-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                              {emp.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors block">
                              {emp.name}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {emp.designation || 'Team Member'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(emp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          emp.role === 'manager'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {emp.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                        {emp.teamId?.name || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        {checkInTime ? (
                          <span>
                            <strong className="text-slate-900">{checkInTime}</strong>{' '}
                            <span className="text-[10px] text-violet-600">({checkInMethod})</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not clocked in</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {emp.email}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedMemberId(emp._id)}
                            className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                            title="View 360° Profile & Records"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={(e) => openEdit(emp, e)}
                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit User"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => toggleActive(emp, e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              emp.isActive
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={emp.isActive ? 'Deactivate User' : 'Activate User'}
                          >
                            {emp.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Form Modal (Edit User) ── */}
      {showEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-slate-900">Edit User Details</h2>
              <button onClick={() => setShowEditForm(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="label font-bold text-slate-700 mb-1">Full Name *</label>
                <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label font-bold text-slate-700 mb-1">Email Address *</label>
                <input type="email" className="input" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label font-bold text-slate-700 mb-1">Phone Number</label>
                <input type="tel" className="input" placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="label font-bold text-slate-700 mb-1">{editUser ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-12"
                    required={!editUser}
                    placeholder={editUser ? 'Enter new password' : 'Enter password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label font-bold text-slate-700 mb-1">Role *</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label font-bold text-slate-700 mb-1">Team</label>
                  <select className="input" value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}>
                    <option value="">No Team</option>
                    {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label font-bold text-slate-700 mb-1">Designation</label>
                <input className="input" placeholder="e.g. Software Developer, Tech Lead" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-3">
                <button type="submit" disabled={submitting} className="btn bg-violet-600 hover:bg-violet-700 text-white font-bold flex-1 py-2.5 rounded-xl shadow-xs">
                  {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Update User'}
                </button>
                <button type="button" onClick={() => setShowEditForm(false)} className="btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 360 Degree Performance & Profile Modal ── */}
      <EmployeeProfileModal isOpen={!!selectedMemberId}
        memberId={selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
      />

      {showCreationModal && (
        <EmployeeCreationModal
          onClose={() => setShowCreationModal(false)}
          onSuccess={() => {
            setShowCreationModal(false);
            fetchData();
          }}
          teams={teams}
        />
      )}
    </div>
  );
}


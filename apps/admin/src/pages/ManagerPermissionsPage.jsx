import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, ShieldCheck, UserCheck, Activity, CheckSquare,
  Clock, RotateCcw, AlertTriangle, CheckCircle2, Shield,
  Users, Search, RefreshCw, X, SlidersHorizontal, Lock,
  KeyRound
} from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';

export default function ManagerPermissionsPage() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetModal, setResetModal] = useState({ open: false, manager: null });
  const [resetting, setResetting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchManagers = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get('/admin/manager-permissions');
      setManagers(res.data?.data?.managers || []);
    } catch (err) {
      console.error('Failed to fetch manager permissions:', err);
      setNotification({
        type: 'error',
        text: err.response?.data?.message || 'Failed to fetch manager permissions.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchManagers(true);
  }, [fetchManagers]);

  const togglePermission = async (managerId, permKey) => {
    const target = managers.find((m) => m._id === managerId);
    if (!target) return;

    const updatedPerms = {
      ...target.permissions,
      [permKey]: !target.permissions[permKey],
    };

    // Optimistic update
    setManagers((prev) =>
      prev.map((m) => {
        if (m._id === managerId) {
          return { ...m, permissions: updatedPerms };
        }
        return m;
      })
    );

    try {
      await api.patch(`/admin/manager-permissions/${managerId}`, { permissions: updatedPerms });
    } catch (err) {
      // Revert on failure
      fetchManagers(true);
      setNotification({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update permission.',
      });
    }
  };

  const handleConfirmResetMfa = async () => {
    if (!resetModal.manager) return;
    const manager = resetModal.manager;
    setResetting(true);
    try {
      const res = await api.post(`/admin/managers/${manager._id}/reset-mfa`);
      setResetModal({ open: false, manager: null });
      setNotification({
        type: 'success',
        text: res.data?.message || `MFA for ${manager.name} has been reset successfully.`,
      });
      // Optimistically update manager status to mfaEnabled: false
      setManagers((prev) =>
        prev.map((m) => (m._id === manager._id ? { ...m, mfaEnabled: false } : m))
      );
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      setNotification({
        type: 'error',
        text: err.response?.data?.message || 'Failed to reset MFA.',
      });
    } finally {
      setResetting(false);
    }
  };

  // Metrics computation for KPI Ribbon
  const stats = useMemo(() => {
    const total = managers.length;
    const mfaActive = managers.filter((m) => m.mfaEnabled).length;
    const mfaPending = managers.filter((m) => !m.mfaEnabled).length;
    const canApproveLeaves = managers.filter((m) => m.permissions?.canApproveLeaves).length;
    const canEditAttendance = managers.filter((m) => m.permissions?.canEditAttendance).length;
    const fullAccess = managers.filter(
      (m) =>
        m.permissions?.canApproveLeaves &&
        m.permissions?.canEditAttendance &&
        m.permissions?.canAddPerformanceNotes &&
        m.permissions?.canViewTeamReports
    ).length;

    return {
      total,
      mfaActive,
      mfaPending,
      canApproveLeaves,
      canEditAttendance,
      fullAccess,
    };
  }, [managers]);

  // Filtered managers by search & status tab
  const filteredManagers = useMemo(() => {
    return managers.filter((m) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        m.name?.toLowerCase().includes(query) ||
        m.email?.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (statusFilter === 'mfa_active') return m.mfaEnabled;
      if (statusFilter === 'mfa_pending') return !m.mfaEnabled;
      if (statusFilter === 'full_access') {
        return (
          m.permissions?.canApproveLeaves &&
          m.permissions?.canEditAttendance &&
          m.permissions?.canAddPerformanceNotes &&
          m.permissions?.canViewTeamReports
        );
      }
      return true;
    });
  }, [managers, search, statusFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin text-sky-600" />
        <p className="text-sm font-semibold text-slate-600">Loading Manager Authorizations & Security…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 max-w-7xl mx-auto pb-8">
      {/* ── 1. Page Header (TimeChamp Style) ── */}
      <PageHeader
        title="Manager Permissions & MFA"
        subtitle="Manage supervisory operational authorizations, team report access, and Multi-Factor Authentication (TOTP) lifecycle."
        badgeText={`${stats.total} Authorized Managers`}
        tabs={[
          { id: 'all', label: 'All Managers', badge: stats.total },
          {
            id: 'mfa_active',
            label: 'MFA Protected',
            badge: stats.mfaActive,
            badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          },
          {
            id: 'mfa_pending',
            label: 'Setup Pending',
            badge: stats.mfaPending,
            badgeClass:
              stats.mfaPending > 0
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-600',
          },
          {
            id: 'full_access',
            label: 'Full Authority',
            badge: stats.fullAccess,
            badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200',
          },
        ]}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
        rightActions={
          <button
            type="button"
            onClick={() => fetchManagers(false)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
            title="Refresh list"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-sky-600' : ''} />
          </button>
        }
      />

      {/* ── 2. Notification Toast ── */}
      {notification && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in shadow-sm ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 3. KPI Ribbon Tiles (Matching 6-tile layout) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          icon={Users}
          value={stats.total}
          label="Total Managers"
          subtext="Assigned Supervisors"
          variant="blue"
        />
        <KpiTile
          icon={ShieldCheck}
          value={stats.mfaActive}
          label="MFA Protected"
          subtext="Active TOTP Enforced"
          variant="green"
        />
        <KpiTile
          icon={Clock}
          value={stats.mfaPending}
          label="Setup Pending"
          subtext="QR Scan on Next Login"
          variant={stats.mfaPending > 0 ? 'amber' : 'slate'}
        />
        <KpiTile
          icon={CheckSquare}
          value={stats.canApproveLeaves}
          label="Leave Decisions"
          subtext="Can Approve Leaves"
          variant="purple"
        />
        <KpiTile
          icon={Activity}
          value={stats.canEditAttendance}
          label="Attendance Edit"
          subtext="Can Edit Records"
          variant="sky"
        />
        <KpiTile
          icon={Shield}
          value={stats.fullAccess}
          label="Full Authority"
          subtext="All 4 Privileges Active"
          variant="emerald"
        />
      </div>

      {/* ── 4. Main Management Panel ── */}
      <Panel
        title="Manager Operational Permissions & MFA"
        badge={`${filteredManagers.length} of ${stats.total} Shown`}
        subtitle="Toggle real-time operational rights for supervisors. Any permission change applies immediately without requiring re-login."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-sm w-48 sm:w-64"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Quick Status Filter Buttons */}
            <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'mfa_active', label: 'MFA Active' },
                { id: 'mfa_pending', label: 'Pending' },
                { id: 'full_access', label: 'Full Access' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {filteredManagers.length === 0 ? (
          <div className="text-center py-16 text-slate-500 space-y-2">
            <Shield size={36} className="mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No managers match the specified criteria</p>
            <p className="text-xs text-slate-400">
              {search ? `No results found for "${search}". Try clearing your search filter.` : 'No managers registered yet.'}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-2 text-xs text-sky-600 hover:text-sky-700 font-semibold"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5">
            {filteredManagers.map((manager) => {
              const permissions = manager.permissions || {};
              const activeCount = [
                permissions.canApproveLeaves,
                permissions.canEditAttendance,
                permissions.canAddPerformanceNotes,
                permissions.canViewTeamReports,
              ].filter(Boolean).length;

              return (
                <div
                  key={manager._id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200 group"
                >
                  {/* Manager Identity Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-sky-500/20 flex-shrink-0">
                        {manager.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-slate-900 group-hover:text-sky-600 transition-colors truncate">
                            {manager.name}
                          </h2>
                          <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold border border-sky-200">
                            Manager
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              activeCount === 4
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : activeCount > 0
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {activeCount}/4 Privileges Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{manager.email}</p>
                      </div>
                    </div>

                    {/* MFA Controls & Status */}
                    <div className="flex items-center gap-2.5 flex-shrink-0 self-start sm:self-center">
                      {manager.mfaEnabled ? (
                        <span
                          id={`mfa-status-${manager._id}`}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          title="MFA is configured and active for this manager"
                        >
                          <ShieldCheck size={14} className="text-emerald-600" />
                          <span>MFA Active</span>
                        </span>
                      ) : (
                        <span
                          id={`mfa-status-${manager._id}`}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          title="Manager must scan fresh QR code upon next login"
                        >
                          <Clock size={14} className="text-amber-600" />
                          <span>Setup Pending / Reset</span>
                        </span>
                      )}

                      <button
                        id={`reset-mfa-${manager._id}`}
                        onClick={() => setResetModal({ open: true, manager })}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                        title="Invalidate current secret and require a fresh QR code scan upon next login"
                      >
                        <RotateCcw size={13} />
                        <span>Reset MFA</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Interactive Permission Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-5">
                    <PermissionToggle
                      id={`perm-leaves-${manager._id}`}
                      label="Approve Leaves"
                      description="Review & decide team leave requests"
                      icon={<CheckSquare size={18} />}
                      isActive={permissions.canApproveLeaves}
                      onToggle={() => togglePermission(manager._id, 'canApproveLeaves')}
                    />
                    <PermissionToggle
                      id={`perm-attendance-${manager._id}`}
                      label="Edit Attendance"
                      description="Correct punch times & attendance logs"
                      icon={<Activity size={18} />}
                      isActive={permissions.canEditAttendance}
                      onToggle={() => togglePermission(manager._id, 'canEditAttendance')}
                    />
                    <PermissionToggle
                      id={`perm-performance-${manager._id}`}
                      label="Performance Notes"
                      description="Submit conduct reviews & team remarks"
                      icon={<UserCheck size={18} />}
                      isActive={permissions.canAddPerformanceNotes}
                      onToggle={() => togglePermission(manager._id, 'canAddPerformanceNotes')}
                    />
                    <PermissionToggle
                      id={`perm-reports-${manager._id}`}
                      label="Team Reports"
                      description="Access hours summaries & analytics"
                      icon={<ShieldCheck size={18} />}
                      isActive={permissions.canViewTeamReports}
                      onToggle={() => togglePermission(manager._id, 'canViewTeamReports')}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── 5. Confirmation Modal for MFA Reset ── */}
      {resetModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 p-6 space-y-4 shadow-2xl rounded-2xl animate-in zoom-in-95 w-full max-w-md">
            <div className="flex items-center gap-2.5 text-rose-600 font-bold text-base">
              <AlertTriangle size={20} />
              <h2>Reset MFA Configuration</h2>
            </div>

            <div className="text-slate-700 text-xs space-y-2.5 leading-relaxed">
              <p>
                Are you sure you want to reset Multi-Factor Authentication for{' '}
                <strong className="text-slate-900 font-semibold">{resetModal.manager?.name}</strong> (
                <span className="font-mono text-slate-800">{resetModal.manager?.email}</span>)?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] leading-relaxed flex items-start gap-2">
                <Lock size={14} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Security Guarantee:</strong> The previous TOTP secret will be invalidated immediately. Any OTPs from their current authenticator app will stop working. They must scan a new QR code upon their next login.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setResetModal({ open: false, manager: null })}
                disabled={resetting}
                className="btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-reset-mfa-btn"
                onClick={handleConfirmResetMfa}
                disabled={resetting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                <span>Confirm Reset MFA</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Interactive Permission Card with iOS Switch ──
const PermissionToggle = ({ label, description, icon, isActive, onToggle, id }) => (
  <div
    id={id}
    onClick={onToggle}
    className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-center justify-between gap-3 select-none ${
      isActive
        ? 'bg-sky-50/50 border-sky-200 shadow-sm hover:border-sky-300 hover:bg-sky-50'
        : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-white'
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          isActive
            ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
          {label}
        </p>
        <p className="text-[10px] text-slate-500 truncate mt-0.5">
          {description}
        </p>
      </div>
    </div>

    {/* Modern iOS-Style Toggle Switch */}
    <div
      className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0 flex items-center ${
        isActive ? 'bg-sky-600' : 'bg-slate-300'
      }`}
    >
      <div
        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
          isActive ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </div>
  </div>
);

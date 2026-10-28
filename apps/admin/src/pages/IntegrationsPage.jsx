import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound, Shield, AlertTriangle, CheckCircle2, Clock, Copy, Check,
  Eye, EyeOff, RotateCw, Trash2, Activity, X, Lock, ExternalLink,
  RefreshCw, Info, Calendar, Server, ShieldAlert, Users, Search, Sliders, Edit3
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SyncHealthBadge from '../components/integrations/SyncHealthBadge';
import EmployeeAudiencePicker from '../components/integrations/EmployeeAudiencePicker';

// Shared by Create Key and Edit Scopes. `sensitive` scopes expose personal or forensic data.
const SCOPE_OPTIONS = [
  { id: 'employees:read', label: 'Employees: Read directory and metadata' },
  { id: 'employees:pii:read', label: 'Employees PII: Address, emergency contact, full name, avatar', sensitive: true },
  { id: 'attendance-daily:read', label: 'Attendance Daily: Read daily check-in logs' },
  { id: 'attendance-audit:read', label: 'Attendance Audit: IPs, GPS, geofence, breaks', sensitive: true },
  { id: 'attendance-history:read', label: 'Attendance History: Read historical records' },
  { id: 'attendance-events:read', label: 'Attendance Events: Read live punch events' },
];

function ScopeCheckboxList({ scopes, onToggle }) {
  return (
    <div className="space-y-1.5 border border-slate-200 rounded-xl p-2.5 max-h-48 overflow-y-auto">
      {SCOPE_OPTIONS.map((scope) => (
        <label key={scope.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50">
          <input
            type="checkbox"
            checked={scopes.includes(scope.id)}
            onChange={() => onToggle(scope.id)}
            className="rounded text-violet-600 focus:ring-violet-500"
          />
          <span className="flex-1">{scope.label}</span>
          {scope.sensitive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              <ShieldAlert size={10} />
              Sensitive
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

const toggleScopeIn = (scopes, scopeId) => {
  if (scopes.includes(scopeId)) {
    return scopes.length === 1 ? scopes : scopes.filter((s) => s !== scopeId); // Keep at least one
  }
  return [...scopes, scopeId];
};

export default function IntegrationsPage() {
  const { user } = useAuth();

  // State: Keys & Loading
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync Health State & Auto-Refresh
  const [syncHealthMap, setSyncHealthMap] = useState({});
  const [syncHealthLoading, setSyncHealthLoading] = useState(false);

  // Modals & Flow States
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'create'|'rotate'|'revoke'|'update_audience'|'update_scopes', payload?: any }
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [rotateModalOpen, setRotateModalOpen] = useState(false);
  const [targetRotateKey, setTargetRotateKey] = useState(null);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [targetRevokeKey, setTargetRevokeKey] = useState(null);
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealedKeyData, setRevealedKeyData] = useState(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [activityKeyId, setActivityKeyId] = useState(null);
  const [rosterModalKey, setRosterModalKey] = useState(null);
  const [editAudienceKey, setEditAudienceKey] = useState(null);
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [editScopesKey, setEditScopesKey] = useState(null);
  const [pollIntervalKey, setPollIntervalKey] = useState(null);
  const [pollIntervalModalOpen, setPollIntervalModalOpen] = useState(false);

  // Alert Banner for Compromised Partial Failure
  const [compromiseAlert, setCompromiseAlert] = useState(null);

  // Fetch keys list
  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/integrations/frappe-hrms/keys');
      setKeys(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load integration keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sync health status for all keys
  const fetchSyncHealth = useCallback(async () => {
    try {
      setSyncHealthLoading(true);
      const res = await api.get('/admin/integrations/frappe-hrms/keys/sync-health');
      const list = res.data?.data || [];
      const map = {};
      for (const item of list) {
        if (item?.keyId) {
          map[item.keyId] = item;
        }
      }
      setSyncHealthMap(map);
    } catch (err) {
      console.error('Failed to load integration sync health:', err);
    } finally {
      setSyncHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchSyncHealth();

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchSyncHealth();
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [fetchKeys, fetchSyncHealth]);

  // Step-Up Gate Handler
  const initiateActionWithStepUp = (actionType, payload = null) => {
    setPendingAction({ type: actionType, payload });
    setStepUpOpen(true);
  };

  // Called when Step-Up challenge succeeds and returns JWT
  const handleStepUpSuccess = async (stepUpToken) => {
    if (!pendingAction) return;

    const { type, payload } = pendingAction;

    if (type === 'create') {
      const ok = await executeCreateKey(payload, stepUpToken);
      if (ok) {
        setStepUpOpen(false);
        setPendingAction(null);
      }
    } else if (type === 'rotate') {
      const ok = await executeRotateKey(payload, stepUpToken);
      if (ok) {
        setStepUpOpen(false);
        setPendingAction(null);
      }
    } else if (type === 'revoke') {
      const ok = await executeRevokeKey(payload, stepUpToken);
      if (ok) {
        setStepUpOpen(false);
        setPendingAction(null);
      }
    } else if (type === 'update_audience') {
      const ok = await executeUpdateAudience(payload, stepUpToken);
      if (ok) {
        setStepUpOpen(false);
        setPendingAction(null);
      }
    } else if (type === 'update_scopes') {
      const ok = await executeUpdateScopes(payload, stepUpToken);
      if (ok) {
        setStepUpOpen(false);
        setPendingAction(null);
      }
    }
  };

  // Execution: Create Key
  const executeCreateKey = async (payload, stepUpToken) => {
    try {
      const res = await api.post('/admin/integrations/frappe-hrms/keys', payload, {
        headers: { 'X-Step-Up-Token': stepUpToken },
      });
      setCreateModalOpen(false);
      setRevealedKeyData(res.data?.data);
      setRevealModalOpen(true);
      fetchKeys();
      fetchSyncHealth();
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate integration key.');
      return false;
    }
  };

  // Execution: Rotate Key
  const executeRotateKey = async (payload, stepUpToken) => {
    try {
      const { keyId, compromised, overlapHours, expiresInDays } = payload;
      const res = await api.post(
        `/admin/integrations/keys/${keyId}/rotate`,
        { compromised, overlapHours, expiresInDays },
        { headers: { 'X-Step-Up-Token': stepUpToken } }
      );
      setRotateModalOpen(false);
      setRevealedKeyData(res.data?.data);
      setRevealModalOpen(true);
      fetchKeys();
      fetchSyncHealth();
      return true;
    } catch (err) {
      if (err.response?.data?.code === 'KEY_REVOKED_REPLACEMENT_FAILED') {
        setRotateModalOpen(false);
        setCompromiseAlert({
          message: err.response.data.message,
          keyId: err.response.data.data?.keyId,
        });
        fetchKeys();
        fetchSyncHealth();
        return true;
      } else {
        alert(err.response?.data?.message || 'Failed to rotate integration key.');
        return false;
      }
    }
  };

  // Execution: Revoke Key
  const executeRevokeKey = async (payload, stepUpToken) => {
    try {
      const { keyId, reason } = payload;
      await api.post(
        `/admin/integrations/keys/${keyId}/revoke`,
        { reason },
        { headers: { 'X-Step-Up-Token': stepUpToken } }
      );
      setRevokeModalOpen(false);
      fetchKeys();
      fetchSyncHealth();
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revoke integration key.');
      return false;
    }
  };

  // Execution: Update Audience
  const executeUpdateAudience = async (payload, stepUpToken) => {
    try {
      const { keyId, employeeScope, allowedEmployees } = payload;
      await api.put(
        `/admin/integrations/keys/${keyId}/audience`,
        { employeeScope, allowedEmployees },
        { headers: { 'X-Step-Up-Token': stepUpToken } }
      );
      setAudienceModalOpen(false);
      setEditAudienceKey(null);
      await Promise.all([fetchKeys(), fetchSyncHealth()]);
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update key audience.');
      return false;
    }
  };

  // Execution: Update Scopes
  const executeUpdateScopes = async (payload, stepUpToken) => {
    try {
      const { keyId, scopes } = payload;
      await api.put(
        `/admin/integrations/keys/${keyId}/scopes`,
        { scopes },
        { headers: { 'X-Step-Up-Token': stepUpToken } }
      );
      setEditScopesKey(null);
      await Promise.all([fetchKeys(), fetchSyncHealth()]);
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update key scopes.');
      return false;
    }
  };

  // Execution: Update Poll Interval Setting
  const handleUpdatePollInterval = async (keyId, expectedPollMinutes) => {
    try {
      await api.patch(`/admin/integrations/keys/${keyId}/settings`, { expectedPollMinutes });
      setPollIntervalModalOpen(false);
      setPollIntervalKey(null);
      await Promise.all([fetchKeys(), fetchSyncHealth()]);
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update sync poll interval.');
      return false;
    }
  };

  // Active Key Stats
  const activeCount = keys.filter((k) => k.status === 'active' && !k.isExpired).length;
  const expiringSoonCount = keys.filter((k) => {
    if (k.status !== 'active' || k.isExpired) return false;
    const daysLeft = (new Date(k.expiresAt) - new Date()) / (24 * 3600 * 1000);
    return daysLeft <= 14;
  }).length;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-fade-in">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Frappe HRMS Integration</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              <KeyRound size={12} /> Stage 1 Credentials
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Generate, rotate, and manage secure API keys for external Frappe HRMS synchronization.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          id="btn-generate-integration-key"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-[0.98] transition-all"
        >
          <KeyRound size={16} />
          Generate Integration Key
        </button>
      </div>

      {/* Info Banner for Password-Only Step-Up (Disappears once D1 MFA enrolls) */}
      {!user?.mfaEnabled && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-amber-900 shadow-sm">
          <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <span className="font-semibold">Security Notice: </span>
            Admin two-factor authentication is not yet available; key operations are protected by administrator password confirmation.
          </div>
        </div>
      )}

      {/* Compromise Partial Failure Alert Banner */}
      {compromiseAlert && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm animate-pulse">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm">
              <p className="font-bold">Compromised Key Revocation Notice</p>
              <p className="mt-0.5">{compromiseAlert.message}</p>
              <p className="mt-1 font-semibold text-rose-700">Old Key ID: {compromiseAlert.keyId} (Revoked)</p>
            </div>
          </div>
          <button
            onClick={() => setCompromiseAlert(null)}
            className="text-rose-500 hover:text-rose-700 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Keys</span>
            <span className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{activeCount}</p>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Authorized for external synchronization</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiring Soon (≤ 14d)</span>
            <span className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={18} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{expiringSoonCount}</p>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Rotate before service disruption</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gateway Status</span>
            <span className="h-8 w-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Server size={18} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">Protected</p>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Endpoint: /api/integrations/v1/ping</span>
        </div>
      </div>

      {/* Main Keys Table Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Configured Integration Keys</h2>
            <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
              {keys.length} total
            </span>
          </div>
          <button
            onClick={() => {
              fetchKeys();
              fetchSyncHealth();
            }}
            disabled={loading || syncHealthLoading}
            className="text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh list and sync health"
          >
            <RefreshCw size={16} className={loading || syncHealthLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-violet-600" />
            Loading integration credentials...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 text-sm">
            {error}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="text-base font-semibold text-slate-700">No integration keys generated yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Generate an integration key to allow Frappe HRMS to synchronize employee attendance data.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 shadow-sm"
            >
              <KeyRound size={14} /> Generate First Key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Name & Key Prefix</th>
                  <th className="py-3 px-4">Env</th>
                  <th className="py-3 px-4">Scopes</th>
                  <th className="py-3 px-4">Audience</th>
                  <th className="py-3 px-4">Sync Health</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {keys.map((k) => {
                  const isRevoked = k.status === 'revoked';
                  const isExpired = k.isExpired;
                  const isActive = k.status === 'active' && !isExpired;

                  return (
                    <tr key={k.keyId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{k.name}</span>
                          <span className="font-mono text-[11px] text-slate-400">{k.keyPrefix}...</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            k.environment === 'live'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          }`}
                        >
                          {k.environment}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-1.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {k.scopes.map((s) => (
                              <span
                                key={s}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  SCOPE_OPTIONS.find((o) => o.id === s)?.sensitive
                                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => setEditScopesKey(k)}
                              className="p-1 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors shrink-0"
                              title="Edit permission scopes"
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {k.employeeScope === 'restricted' ? (
                            <button
                              type="button"
                              onClick={() => setRosterModalKey(k)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 transition-colors"
                              title="Click to view assigned employee roster"
                            >
                              <Users size={12} />
                              <span>Restricted ({k.allowedEmployeeCount ?? k.allowedEmployees?.length ?? 0})</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              <CheckCircle2 size={12} />
                              <span>All Employees</span>
                            </span>
                          )}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditAudienceKey(k);
                                setAudienceModalOpen(true);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                              title="Edit employee audience"
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <SyncHealthBadge
                          health={syncHealthMap[k.keyId]}
                          onConfigureInterval={() => {
                            setPollIntervalKey(k);
                            setPollIntervalModalOpen(true);
                          }}
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full ring-1 ring-rose-200">
                            Revoked ({k.revokeReason || 'manual'})
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex flex-col">
                          <span>{new Date(k.expiresAt).toLocaleDateString()}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(k.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {k.lastUsedAt ? (
                          <span>{new Date(k.lastUsedAt).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-slate-400 italic">Never used</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1">
                        <button
                          onClick={() => {
                            setActivityKeyId(k.keyId);
                            setActivityDrawerOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                          title="View Request Logs"
                        >
                          <Activity size={14} />
                          <span className="hidden sm:inline">Activity</span>
                        </button>

                        <button
                          disabled={!isActive}
                          onClick={() => {
                            setPollIntervalKey(k);
                            setPollIntervalModalOpen(true);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            isActive
                              ? 'text-slate-600 hover:bg-slate-100'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                          title={isActive ? 'Configure sync polling interval' : 'Key is inactive'}
                        >
                          <Sliders size={14} />
                          <span className="hidden sm:inline">Settings</span>
                        </button>

                        <button
                          disabled={!isActive}
                          onClick={() => {
                            setTargetRotateKey(k);
                            setRotateModalOpen(true);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            isActive
                              ? 'text-violet-600 hover:bg-violet-50'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                          title={isActive ? 'Rotate key' : 'Cannot rotate inactive key'}
                        >
                          <RotateCw size={14} />
                          <span className="hidden sm:inline">Rotate</span>
                        </button>

                        <button
                          disabled={isRevoked}
                          onClick={() => {
                            setTargetRevokeKey(k);
                            setRevokeModalOpen(true);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            !isRevoked
                              ? 'text-rose-600 hover:bg-rose-50'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                          title={!isRevoked ? 'Revoke key' : 'Already revoked'}
                        >
                          <Trash2 size={14} />
                          <span className="hidden sm:inline">Revoke</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODALS & DRAWERS ── */}

      {/* 1. Create Key Modal (z-50) */}
      {createModalOpen && (
        <CreateKeyModal
          onClose={() => setCreateModalOpen(false)}
          onSubmit={(data) => initiateActionWithStepUp('create', data)}
        />
      )}

      {/* 2. Rotate Key Modal (z-50) */}
      {rotateModalOpen && targetRotateKey && (
        <RotateKeyModal
          keyRecord={targetRotateKey}
          onClose={() => {
            setRotateModalOpen(false);
            setTargetRotateKey(null);
          }}
          onSubmit={(data) => initiateActionWithStepUp('rotate', { keyId: targetRotateKey.keyId, ...data })}
        />
      )}

      {/* 3. Revoke Confirm Modal (z-50) */}
      {revokeModalOpen && targetRevokeKey && (
        <RevokeConfirmModal
          keyRecord={targetRevokeKey}
          onClose={() => {
            setRevokeModalOpen(false);
            setTargetRevokeKey(null);
          }}
          onConfirm={(reason) => initiateActionWithStepUp('revoke', { keyId: targetRevokeKey.keyId, reason })}
        />
      )}

      {/* 4. Activity Log Drawer (z-50) */}
      {activityDrawerOpen && activityKeyId && (
        <KeyActivityDrawer
          keyId={activityKeyId}
          onClose={() => {
            setActivityDrawerOpen(false);
            setActivityKeyId(null);
          }}
        />
      )}

      {/* 4b. View Assigned Employee Roster Modal (z-50) */}
      {rosterModalKey && (
        <ViewRosterModal
          keyRecord={rosterModalKey}
          onClose={() => setRosterModalKey(null)}
        />
      )}

      {/* 4c. Edit Audience Modal (z-50) */}
      {audienceModalOpen && editAudienceKey && (
        <EditAudienceModal
          keyRecord={editAudienceKey}
          onClose={() => {
            setAudienceModalOpen(false);
            setEditAudienceKey(null);
          }}
          onSubmit={(data) =>
            initiateActionWithStepUp('update_audience', {
              keyId: editAudienceKey.keyId,
              ...data,
            })
          }
        />
      )}

      {/* 4c-2. Edit Scopes Modal (z-50) */}
      {editScopesKey && (
        <EditScopesModal
          keyRecord={editScopesKey}
          onClose={() => setEditScopesKey(null)}
          onSubmit={(scopes) =>
            initiateActionWithStepUp('update_scopes', { keyId: editScopesKey.keyId, scopes })
          }
        />
      )}

      {/* 4d. Configure Poll Interval Modal (z-50) */}
      {pollIntervalModalOpen && pollIntervalKey && (
        <ConfigurePollIntervalModal
          keyRecord={pollIntervalKey}
          currentHealth={syncHealthMap[pollIntervalKey.keyId]}
          onClose={() => {
            setPollIntervalModalOpen(false);
            setPollIntervalKey(null);
          }}
          onSubmit={handleUpdatePollInterval}
        />
      )}

      {/* 5. Step-Up Authentication Modal (z-[70] - mounts cleanly in front of active form) */}
      {stepUpOpen && (
        <StepUpModal
          onClose={() => {
            setStepUpOpen(false);
            setPendingAction(null);
          }}
          onSuccess={handleStepUpSuccess}
          operation={pendingAction?.type ? `integration_key:${pendingAction.type}` : 'integration_key:create'}
          targetKeyId={pendingAction?.payload?.keyId}
          mfaEnabled={Boolean(user?.mfaEnabled)}
        />
      )}

      {/* 6. One-Time Secret Reveal Modal (z-[80] - floats above everything) */}
      {revealModalOpen && revealedKeyData && (
        <OneTimeRevealModal
          data={revealedKeyData}
          onClose={() => {
            setRevealModalOpen(false);
            setRevealedKeyData(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StepUpModal: Prompts for administrator password confirmation + optional OTP
 */
function StepUpModal({ onClose, onSuccess, operation, targetKeyId, mfaEnabled }) {
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/admin/auth/step-up', {
        password,
        otp: mfaEnabled ? otp : undefined,
        operation,
        targetKeyId,
      });

      const token = res.data?.data?.token;
      if (!token) throw new Error('No step-up token returned by server.');

      await onSuccess(token);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Password confirmation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-violet-600" />
            <h3 className="font-bold text-slate-900 text-base">Confirm Administrator Password</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          This is a sensitive key management action. Please verify your credentials to continue.
        </p>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Account Password</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your administrator password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {mfaEnabled && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                6-Digit Authenticator Code (MFA)
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full font-mono text-center tracking-widest rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm transition-all"
            >
              {loading && <RefreshCw size={14} className="animate-spin" />}
              Verify & Proceed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * CreateKeyModal: Generates a new integration key with employee audience selection
 */
function CreateKeyModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('live');
  const [scopes, setScopes] = useState([
    'employees:read',
    'attendance-daily:read',
  ]);
  const [expiresInDays, setExpiresInDays] = useState(90);

  // Audience Scoping State
  const [employeeScope, setEmployeeScope] = useState('all'); // 'all' | 'restricted'
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Fetch employees list when modal mounts
  useEffect(() => {
    let isMounted = true;
    const fetchEmployeesList = async () => {
      try {
        setLoadingEmployees(true);
        const res = await api.get('/admin/employees');
        if (isMounted) {
          setEmployees(res.data?.data?.employees || []);
        }
      } catch (err) {
        console.error('Failed to load employees for audience picker:', err);
      } finally {
        if (isMounted) setLoadingEmployees(false);
      }
    };
    fetchEmployeesList();
    return () => { isMounted = false; };
  }, []);

  const handleToggleScope = (scopeId) => setScopes(toggleScopeIn(scopes, scopeId));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (employeeScope === 'restricted' && selectedEmployeeIds.length === 0) {
      alert('Please select at least one employee for the restricted audience.');
      return;
    }

    onSubmit({
      name: name.trim(),
      environment,
      scopes,
      expiresInDays: Number(expiresInDays),
      employeeScope,
      allowedEmployees: employeeScope === 'restricted' ? selectedEmployeeIds : [],
    });
  };

  const isSubmitDisabled = !name.trim() || (employeeScope === 'restricted' && selectedEmployeeIds.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-violet-600" />
            <h3 className="font-bold text-slate-900 text-base">Generate New Integration Key</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Key Label */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Key Label / Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frappe HRMS Production Sync"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Environment */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Environment</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  environment === 'live'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="env"
                  value="live"
                  checked={environment === 'live'}
                  onChange={() => setEnvironment('live')}
                  className="hidden"
                />
                Live Production
              </label>

              <label
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  environment === 'test'
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="env"
                  value="test"
                  checked={environment === 'test'}
                  onChange={() => setEnvironment('test')}
                  className="hidden"
                />
                Test / Sandbox
              </label>
            </div>
          </div>

          {/* Permission Scopes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Permission Scopes</label>
            <ScopeCheckboxList scopes={scopes} onToggle={handleToggleScope} />
          </div>

          {/* Employee Audience Scope */}
          <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Users size={14} className="text-violet-600" />
                Employee Audience Scope
              </label>
              <span className="text-[11px] text-slate-500">Controls data visibility</span>
            </div>

            <EmployeeAudiencePicker
              employeeScope={employeeScope}
              setEmployeeScope={setEmployeeScope}
              selectedEmployeeIds={selectedEmployeeIds}
              setSelectedEmployeeIds={setSelectedEmployeeIds}
              employees={employees}
              loading={loadingEmployees}
            />
          </div>

          {/* Expiration Lifetime */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Key Expiration Lifetime</label>
            <div className="grid grid-cols-3 gap-2">
              {[30, 90, 180].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setExpiresInDays(days)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    expiresInDays === days
                      ? 'border-violet-600 bg-violet-50 text-violet-700 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all ${
                isSubmitDisabled
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'text-white bg-violet-600 hover:bg-violet-700'
              }`}
            >
              Continue to Step-Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * EditAudienceModal: Modifies employee audience scoping under Step-Up protection
 */
function EditAudienceModal({ keyRecord, onClose, onSubmit }) {
  const [employeeScope, setEmployeeScope] = useState(keyRecord.employeeScope || 'all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => {
    return (keyRecord.allowedEmployees || []).map((e) =>
      typeof e === 'object' && e !== null ? String(e._id) : String(e)
    );
  });
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchEmployeesList = async () => {
      try {
        setLoadingEmployees(true);
        const res = await api.get('/admin/employees');
        if (isMounted) {
          setEmployees(res.data?.data?.employees || []);
        }
      } catch (err) {
        console.error('Failed to load employees for audience picker:', err);
      } finally {
        if (isMounted) setLoadingEmployees(false);
      }
    };
    fetchEmployeesList();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (employeeScope === 'restricted' && selectedEmployeeIds.length === 0) {
      alert('Please select at least one employee for the restricted audience.');
      return;
    }
    onSubmit({
      employeeScope,
      allowedEmployees: employeeScope === 'restricted' ? selectedEmployeeIds : [],
    });
  };

  const isSubmitDisabled = employeeScope === 'restricted' && selectedEmployeeIds.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-violet-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Edit Employee Audience</h3>
              <p className="font-mono text-xs text-slate-400">
                Key: {keyRecord.name} (v{keyRecord.audienceVersion || 1})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="p-3 bg-violet-50/70 border border-violet-200/80 rounded-xl text-xs text-violet-900 flex items-start gap-2.5">
            <Info size={16} className="text-violet-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Automatic Synchronization Awareness: </span>
              Expanding this key&apos;s audience (adding employees or switching to Org-Wide) increments the{' '}
              <code className="font-mono font-bold bg-violet-100 px-1 py-0.5 rounded text-violet-800">
                audienceVersion
              </code>
              . The Frappe HRMS auto-sync connector detects this change on its next scheduled cycle and immediately initiates a historical backfill for the newly permitted employees.
            </div>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/90 space-y-3">
            <EmployeeAudiencePicker
              employeeScope={employeeScope}
              setEmployeeScope={setEmployeeScope}
              selectedEmployeeIds={selectedEmployeeIds}
              setSelectedEmployeeIds={setSelectedEmployeeIds}
              employees={employees}
              loading={loadingEmployees}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all ${
                isSubmitDisabled
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'text-white bg-violet-600 hover:bg-violet-700'
              }`}
            >
              Verify Step-Up & Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * EditScopesModal: Changes an active key's permission scopes in place (same secret) under Step-Up protection
 */
function EditScopesModal({ keyRecord, onClose, onSubmit }) {
  const [scopes, setScopes] = useState(keyRecord.scopes || []);

  const unchanged =
    scopes.length === keyRecord.scopes.length && scopes.every((s) => keyRecord.scopes.includes(s));
  const addedSensitive = scopes.filter(
    (s) => !keyRecord.scopes.includes(s) && SCOPE_OPTIONS.find((o) => o.id === s)?.sensitive
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (unchanged) return;
    onSubmit(scopes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-violet-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Edit Permission Scopes</h3>
              <p className="font-mono text-xs text-slate-400">Key: {keyRecord.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="p-3 bg-violet-50/70 border border-violet-200/80 rounded-xl text-xs text-violet-900 flex items-start gap-2.5">
            <Info size={16} className="text-violet-600 shrink-0 mt-0.5" />
            <div>
              Scope changes apply on the connector&apos;s next request. The key secret is unchanged, so nothing needs to be
              reconfigured in Frappe HRMS.
            </div>
          </div>

          <ScopeCheckboxList scopes={scopes} onToggle={(id) => setScopes(toggleScopeIn(scopes, id))} />

          {addedSensitive.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sensitive data: </span>
                granting {addedSensitive.join(', ')} sends personal or location data to the external system holding this
                key. Confirm it is covered by your data-processing agreement.
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={unchanged}
              className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all ${
                unchanged
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'text-white bg-violet-600 hover:bg-violet-700'
              }`}
            >
              Verify Step-Up & Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * ConfigurePollIntervalModal: Configures expected polling frequency for sync health evaluation
 */
function ConfigurePollIntervalModal({ keyRecord, currentHealth, onClose, onSubmit }) {
  const [minutes, setMinutes] = useState(
    keyRecord.expectedPollMinutes || currentHealth?.expectedPollMinutes || 5
  );
  const [submitting, setSubmitting] = useState(false);

  const presets = [1, 5, 10, 15, 30, 60];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = Number(minutes);
    if (isNaN(val) || val < 1 || val > 1440) {
      alert('Poll interval must be between 1 and 1440 minutes.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(keyRecord.keyId, val);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-violet-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Configure Polling Interval</h3>
              <p className="font-mono text-xs text-slate-400">Key: {keyRecord.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Set how frequently Frappe HRMS or your external ERP is expected to poll attendance feeds. Sync Health uses this to detect delayed and stale connections.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Preset Intervals</label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    Number(minutes) === p
                      ? 'border-violet-600 bg-violet-50 text-violet-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p} min {p === 5 ? '(Default)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Interval (1 – 1440 Minutes)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1 font-mono">
            <div className="flex justify-between">
              <span>Delayed Threshold:</span>
              <strong className="text-amber-600">&gt; {Math.round(Number(minutes) * 1.5)} minutes</strong>
            </div>
            <div className="flex justify-between">
              <span>Stale Threshold:</span>
              <strong className="text-rose-600">&gt; {Math.round(Number(minutes) * 3)} minutes</strong>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm transition-all"
            >
              {submitting && <RefreshCw size={14} className="animate-spin" />}
              Save Setting
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * RotateKeyModal: Rotates an existing key with overlap slider and compromised option
 */
function RotateKeyModal({ keyRecord, onClose, onSubmit }) {
  const [compromised, setCompromised] = useState(false);
  const [overlapHours, setOverlapHours] = useState(24);
  const [expiresInDays, setExpiresInDays] = useState(90);

  // Compute remaining hours on the old key
  const oldRemainingHours = Math.max(0, Math.round((new Date(keyRecord.expiresAt) - new Date()) / (3600 * 1000)));
  const effectiveOverlap = compromised ? 0 : Math.min(overlapHours, oldRemainingHours);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      compromised,
      overlapHours: compromised ? 0 : Number(overlapHours),
      expiresInDays: Number(expiresInDays),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <RotateCw size={18} className="text-violet-600" />
            <h3 className="font-bold text-slate-900 text-base">Rotate Integration Key</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
          <span className="text-slate-500">Rotating Key: </span>
          <span className="font-semibold text-slate-900">{keyRecord.name}</span>
          <div className="font-mono text-slate-400 mt-0.5">{keyRecord.keyPrefix}...</div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Compromised Checkbox */}
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={compromised}
                onChange={(e) => setCompromised(e.target.checked)}
                className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
              />
              <div className="text-xs">
                <span className="font-bold text-rose-900">Key is Compromised</span>
                <p className="text-rose-700 mt-0.5">
                  Check this if the secret key was leaked. Overlap will be forced to 0 hours, and the old key will be revoked immediately before issuing the replacement.
                </p>
              </div>
            </label>
          </div>

          {/* Overlap Slider (Only active if not compromised) */}
          <div className={compromised ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Overlap Duration (0 to 24 Hours)</label>
              <span className="text-xs font-bold text-violet-700">{overlapHours} Hours</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={overlapHours}
              onChange={(e) => setOverlapHours(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>0h (Instant Revoke)</span>
              <span>12h</span>
              <span>24h (Max Overlap)</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Effective overlap window: <span className="font-semibold text-slate-700">{effectiveOverlap} hours</span> (bounded by remaining old key lifetime).
            </p>
          </div>

          {/* New Key Expiry */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Key Expiry (1 to 180 Days)</label>
            <input
              type="number"
              min={1}
              max={180}
              required
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-sm transition-all ${
                compromised
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-violet-600 hover:bg-violet-700'
              }`}
            >
              {compromised ? 'Revoke Now & Replace' : 'Rotate Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * RevokeConfirmModal: Confirms permanent key revocation
 */
function RevokeConfirmModal({ keyRecord, onClose, onConfirm }) {
  const [reason, setReason] = useState('manual');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <div className="flex items-center gap-2 text-rose-600 mb-2">
          <Trash2 size={20} />
          <h3 className="font-bold text-slate-900 text-base">Revoke Integration Key</h3>
        </div>

        <p className="text-xs text-slate-600 mt-2">
          Are you sure you want to permanently revoke <span className="font-semibold text-slate-900">{keyRecord.name}</span>?
          Any integration or ERP system using this key will immediately receive <span className="font-semibold text-rose-600">401 Unauthorized</span>.
        </p>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Revocation Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
          >
            <option value="manual">Manual Decommission</option>
            <option value="compromised">Security Compromise / Key Leaked</option>
            <option value="rotated">Replaced by another key</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm"
          >
            Confirm Revocation
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * OneTimeRevealModal: Displays the newly generated secret key exactly once
 */
function OneTimeRevealModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const rawKey = data?.rawKey || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center gap-2 text-emerald-600 mb-2">
          <CheckCircle2 size={22} />
          <h3 className="font-bold text-slate-900 text-lg">Integration Key Generated</h3>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs mt-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong>Copy your API key now.</strong> For security purposes, this secret key will never be shown again. If you lose it, you will need to rotate or generate a new key.
          </span>
        </div>

        {/* Audience Scope Summary */}
        <div className="mt-3 p-2.5 bg-violet-50/60 border border-violet-200 rounded-xl flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700 flex items-center gap-1.5">
            <Users size={14} className="text-violet-600" />
            Configured Audience:
          </span>
          <span className="font-bold text-violet-900">
            {data?.credential?.employeeScope === 'restricted'
              ? `Restricted (${data?.credential?.allowedEmployees?.length || 0} employees)`
              : 'All Employees (Organization-Wide)'}
          </span>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Generated Secret Key</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={visible ? 'text' : 'password'}
                readOnly
                value={rawKey}
                className="w-full font-mono text-xs rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 pr-10 text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                title={visible ? 'Hide secret' : 'Show secret'}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy Key'}
            </button>
          </div>
        </div>

        {/* Mandatory acknowledgment checkbox */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-violet-600 focus:ring-violet-500"
            />
            <span className="text-xs text-slate-700 font-medium">
              I have copied and saved this secret key in a secure vault. I understand it will never be displayed again.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end mt-5 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={!acknowledged}
            onClick={onClose}
            className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${
              acknowledged
                ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            I Have Saved This Key
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * KeyActivityDrawer: Slide-over drawer displaying paged request logs for a keyId
 */
function KeyActivityDrawer({ keyId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/admin/integrations/keys/${keyId}/activity`);
        setLogs(res.data?.data?.logs || []);
      } catch (err) {
        console.error('Failed to load key activity logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [keyId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Integration Key Activity</h3>
            <span className="font-mono text-xs text-slate-400">keyId: {keyId}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-violet-600" />
              Loading activity logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No recent requests recorded for this key.
            </div>
          ) : (
            logs.map((log) => {
              const isSuccess = log.status >= 200 && log.status < 300;
              return (
                <div
                  key={log._id || log.requestId}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                        isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="font-semibold text-slate-800">{log.method}</span>
                    <span className="font-mono text-slate-500 text-[11px] truncate max-w-[160px]">
                      {log.route}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>{log.durationMs}ms</span>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ViewRosterModal: Displays authorized employee roster for a restricted integration key
 */
function ViewRosterModal({ keyRecord, onClose }) {
  const employees = keyRecord?.allowedEmployees || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-violet-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Authorized Employee Roster</h3>
              <p className="text-xs text-slate-500 font-mono">Key: {keyRecord.name} ({keyRecord.keyPrefix}...)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 py-1 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <span>Total Authorized: <strong className="text-violet-700">{employees.length}</strong> employees</span>
          <span className="text-[11px] text-slate-400">Strict server-side isolation</span>
        </div>

        <div className="mt-2 border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 overflow-y-auto flex-1">
          {employees.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No employees assigned to this credential.
            </div>
          ) : (
            employees.map((emp, idx) => (
              <div key={emp._id || idx} className="p-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {emp.name?.[0]?.toUpperCase() || 'E'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{emp.name || emp._id}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {emp.email} {emp.employeeId ? `· #${emp.employeeId}` : ''}
                    </p>
                  </div>
                </div>
                {emp.department && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full shrink-0 ml-2">
                    {emp.department}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-3 mt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

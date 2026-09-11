import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { Calendar, Plus, Loader2, CheckCircle, XCircle, CalendarDays } from 'lucide-react';

const statusPill = {
  pending: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-rose-50 text-rose-600',
};

export default function LeavePage() {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const fetchData = async () => {
    try {
      const [balRes, reqRes, typesRes] = await Promise.all([
        api.get('/employee/leave/balance'),
        api.get('/employee/leave/requests/me'),
        api.get('/employee/leave/types').catch(() => null),
      ]);
      const bals = balRes.data?.data?.balances || [];
      setBalances(bals);

      const typesFromApi = typesRes?.data?.data?.leaveTypes || balRes.data?.data?.leaveTypes;
      if (typesFromApi && typesFromApi.length > 0) {
        setLeaveTypes(typesFromApi);
      } else if (bals.length > 0) {
        setLeaveTypes(
          bals
            .filter((b) => b.leaveTypeId && b.leaveTypeId._id)
            .map((b) => ({
              _id: b.leaveTypeId._id,
              name: b.leaveTypeId.name,
              code: b.leaveTypeId.code,
            }))
        );
      }
      setRequests(reqRes.data?.data?.requests || []);
    } catch (err) {
      console.error('LeavePage fetchData error:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onSubmit = async (data) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await api.post('/employee/leave/apply', data);
      setMessage({ type: 'success', text: 'Leave request submitted successfully!' });
      setShowForm(false);
      reset();
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to apply for leave.' });
    } finally {
      setSubmitting(false);
    }
  };

  const balVariants = [
    'from-sky-100 to-sky-50 text-sky-600 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]',
    'from-violet-100 to-violet-50 text-violet-600 shadow-[0_4px_10px_-3px_rgba(139,92,246,0.4)]',
    'from-emerald-100 to-emerald-50 text-emerald-600 shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]',
    'from-amber-100 to-amber-50 text-amber-600 shadow-[0_4px_10px_-3px_rgba(245,158,11,0.4)]',
  ];

  return (
    <div className="relative page-container animate-fade-in">
      {/* Pastel lavender ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(167,139,250,0.16),transparent_70%)]" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        <div className="absolute left-0 top-72 h-72 w-72 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(139,92,246,0.5)]">
                <Calendar size={20} />
              </span>
              Leave Management
            </h1>
            <p className="text-slate-400 text-sm mt-1">Apply for leave and track your requests</p>
          </div>
          <button
            id="apply-leave-btn"
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            <Plus size={16} /> Apply
          </button>
        </div>

        {message && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium ${
            message.type === 'success' ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600' : 'bg-rose-50/80 border-rose-100 text-rose-600'
          }`}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* Leave Balances — floating pastel tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {balances.map((bal, i) => {
            const pct = bal.allocated > 0 ? Math.round(((bal.allocated - bal.used) / bal.allocated) * 100) : 0;
            const v = balVariants[i % balVariants.length];
            return (
              <div key={bal._id} className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-4 text-center shadow-[0_10px_26px_-12px_rgba(148,163,184,0.5),inset_0_1px_0_rgba(255,255,255,0.9)]">
                <div className={`w-9 h-9 mx-auto rounded-2xl bg-gradient-to-br ${v} flex items-center justify-center mb-2`}>
                  <CalendarDays size={16} />
                </div>
                <p className="text-xs font-semibold text-slate-500 mb-1">{bal.leaveTypeId?.name}</p>
                <p className="text-3xl font-extrabold text-slate-800 font-mono tabular-nums">{bal.allocated - bal.used}</p>
                <p className="text-[11px] text-slate-400 mt-1">of {bal.allocated} available</p>
                <div className="mt-2.5 h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Apply Form */}
        {showForm && (
          <div className="relative overflow-hidden rounded-3xl p-[3px] bg-gradient-to-r from-violet-300 via-fuchsia-300 to-sky-300 shadow-[0_16px_40px_-16px_rgba(139,92,246,0.5)] animate-slide-up">
            <div className="relative rounded-[calc(1.5rem-3px)] bg-white/90 backdrop-blur-sm p-5">
              <h2 className="font-bold text-slate-800 text-base mb-4">Apply for Leave</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label text-xs !mb-0">Leave Type *</label>
                    {errors.leaveTypeId && (
                      <span className="text-[11px] text-rose-500 font-medium">{errors.leaveTypeId.message}</span>
                    )}
                  </div>
                  <select
                    className={`input text-sm ${errors.leaveTypeId ? 'border-rose-300 focus:ring-rose-300' : ''}`}
                    {...register('leaveTypeId', { required: 'Please select a leave type' })}
                  >
                    <option value="">Select leave type</option>
                    {leaveTypes.map((lt) => (
                      <option key={lt._id} value={lt._id}>
                        {lt.name} ({lt.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label text-xs !mb-0">Start Date *</label>
                      {errors.startDate && (
                        <span className="text-[11px] text-rose-500 font-medium">{errors.startDate.message}</span>
                      )}
                    </div>
                    <input
                      type="date"
                      className={`input text-sm ${errors.startDate ? 'border-rose-300 focus:ring-rose-300' : ''}`}
                      {...register('startDate', { required: 'Start date is required' })}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label text-xs !mb-0">End Date *</label>
                      {errors.endDate && (
                        <span className="text-[11px] text-rose-500 font-medium">{errors.endDate.message}</span>
                      )}
                    </div>
                    <input
                      type="date"
                      className={`input text-sm ${errors.endDate ? 'border-rose-300 focus:ring-rose-300' : ''}`}
                      {...register('endDate', {
                        required: 'End date is required',
                        validate: (val, formValues) =>
                          !formValues.startDate || val >= formValues.startDate || 'End date cannot be before start date',
                      })}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label text-xs !mb-0">Reason *</label>
                    {errors.reason && (
                      <span className="text-[11px] text-rose-500 font-medium">{errors.reason.message}</span>
                    )}
                  </div>
                  <textarea
                    className={`input text-sm resize-none ${errors.reason ? 'border-rose-300 focus:ring-rose-300' : ''}`}
                    rows={3}
                    placeholder="Briefly describe your reason..."
                    {...register('reason', {
                      required: 'Reason is required',
                      minLength: { value: 3, message: 'Reason must be at least 3 characters' },
                    })}
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    id="submit-leave-request-btn"
                    disabled={submitting}
                    className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 font-medium"
                  >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn-ghost flex-1 py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Leave Requests History */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 p-5 shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h2 className="font-bold text-slate-800 text-base mb-4">Leave Requests</h2>
          {requests.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No leave requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req._id} className="flex items-start justify-between p-3 rounded-2xl border border-violet-50 bg-white/70 hover:bg-white hover:shadow-[0_6px_18px_-8px_rgba(139,92,246,0.35)] transition-all">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{req.leaveTypeId?.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium font-mono">{req.startDate} → {req.endDate} ({req.totalDays} day{req.totalDays > 1 ? 's' : ''})</p>
                    <p className="text-xs text-slate-400 mt-0.5">{req.reason}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${statusPill[req.status] || 'bg-slate-100 text-slate-600'}`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { Calendar, Plus, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

const statusColors = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
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
      const [balRes, reqRes] = await Promise.all([
        api.get('/employee/leave/balance'),
        api.get('/employee/leave/requests/me'),
      ]);
      const bals = balRes.data.data.balances || [];
      setBalances(bals);
      setLeaveTypes(bals.map(b => ({ _id: b.leaveTypeId?._id, name: b.leaveTypeId?.name, code: b.leaveTypeId?.code })));
      setRequests(reqRes.data.data.requests || []);
    } catch (err) {
      console.error(err);
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

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar size={20} className="text-primary-400" /> Leave Management
            </h1>
            <p className="text-slate-400 text-sm">Apply for leave and track your requests</p>
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
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
            message.type === 'success' ? 'bg-success-500/10 border-success-500/30 text-success-400' : 'bg-danger-500/10 border-danger-500/30 text-danger-400'
          }`}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* Leave Balances */}
        <div className="grid grid-cols-2 gap-3">
          {balances.map((bal) => (
            <div key={bal._id} className="card text-center">
              <p className="text-xs text-slate-400 mb-1">{bal.leaveTypeId?.name}</p>
              <p className="text-3xl font-bold text-white">{bal.allocated - bal.used}</p>
              <p className="text-xs text-slate-500 mt-1">of {bal.allocated} available</p>
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full"
                  style={{ width: `${bal.allocated > 0 ? ((bal.allocated - bal.used) / bal.allocated) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Apply Form */}
        {showForm && (
          <div className="card border-primary-500/30 animate-slide-up">
            <h2 className="font-semibold text-white mb-4">Apply for Leave</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Leave Type *</label>
                <select className="input" {...register('leaveTypeId', { required: true })}>
                  <option value="">Select leave type</option>
                  {leaveTypes.map(lt => (
                    <option key={lt._id} value={lt._id}>{lt.name} ({lt.code})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date *</label>
                  <input type="date" className="input" {...register('startDate', { required: true })} />
                </div>
                <div>
                  <label className="label">End Date *</label>
                  <input type="date" className="input" {...register('endDate', { required: true })} />
                </div>
              </div>
              <div>
                <label className="label">Reason *</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Briefly describe your reason..."
                  {...register('reason', { required: true, minLength: 10 })}
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Leave Requests History */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Leave Requests</h2>
          {requests.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No leave requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req._id} className="flex items-start justify-between py-3 border-b border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{req.leaveTypeId?.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{req.startDate} → {req.endDate} ({req.totalDays} day{req.totalDays > 1 ? 's' : ''})</p>
                    <p className="text-xs text-slate-500 mt-0.5">{req.reason}</p>
                  </div>
                  <span className={statusColors[req.status] || 'badge-gray'}>{req.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

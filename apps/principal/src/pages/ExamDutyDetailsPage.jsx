import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Calendar as CalendarIcon, MapPin, Clock, Users,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, ChevronRight, UserPlus
} from 'lucide-react';
import api from '../lib/api';

export default function ExamDutyDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [duty, setDuty] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reassignment Modal State
  const [reassigningId, setReassigningId] = useState(null);
  const [availablePersonnel, setAvailablePersonnel] = useState([]);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [submittingReassign, setSubmittingReassign] = useState(false);
  const [reassignError, setReassignError] = useState('');

  const fetchDetails = async () => {
    try {
      const res = await api.get(`/exam-duties/${id}`);
      setDuty(res.data.data.examDuty);
      setAssignments(res.data.data.assignments);
    } catch (err) {
      console.error(err);
      alert('Failed to load exam duty details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleOpenReassign = async (assignmentId) => {
    setReassigningId(assignmentId);
    setNewUserId('');
    setReassignError('');
    setLoadingPersonnel(true);
    try {
      const res = await api.get('/exam-duties/personnel');
      setAvailablePersonnel(res.data.data.personnel || []);
    } catch (err) {
      setReassignError('Failed to fetch personnel');
    } finally {
      setLoadingPersonnel(false);
    }
  };

  const submitReassign = async () => {
    if (!newUserId) return setReassignError('Select a user to reassign to.');
    
    setSubmittingReassign(true);
    setReassignError('');
    try {
      await api.post(`/exam-duties/assignments/${reassigningId}/reassign`, { newUserId });
      setReassigningId(null);
      fetchDetails(); // Refresh everything
    } catch (err) {
      setReassignError(err.response?.data?.message || 'Failed to reassign duty');
    } finally {
      setSubmittingReassign(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading details...</div>;
  }

  if (!duty) {
    return <div className="p-8 text-center text-rose-500">Exam duty not found.</div>;
  }

  const activeAssignments = assignments.filter(a => a.status !== 'REASSIGNED');
  const rejectedAssignments = activeAssignments.filter(a => a.status === 'REJECTED');
  const pendingAssignments = activeAssignments.filter(a => a.status === 'PENDING');
  const acceptedAssignments = activeAssignments.filter(a => a.status === 'ACCEPTED');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/exam-duties')}
          className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{duty.examName}</h1>
          <p className="text-slate-500">{duty.course} • {duty.subject} • Sem {duty.semester}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-wrap gap-x-12 gap-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
            <CalendarIcon size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">DATE & SESSION</p>
            <p className="text-base font-bold text-slate-900">
              {new Date(duty.date).toLocaleDateString()} ({duty.session})
            </p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">TIMINGS</p>
            <p className="text-base font-bold text-slate-900">
              Report: {new Date(duty.reportingTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} | 

              Exam: {new Date(duty.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - {new Date(duty.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <MapPin size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">LOCATION</p>
            <p className="text-base font-bold text-slate-900">
              {duty.location.room} <span className="text-slate-500 font-medium text-sm">({duty.location.building})</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-primary-600" /> Duty Assignments
          <span className="bg-slate-100 text-slate-600 text-sm px-2 py-0.5 rounded-full font-medium ml-2">{activeAssignments.length}</span>
        </h2>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-700 font-medium mb-1">Accepted</p>
              <p className="text-2xl font-bold text-emerald-700">{acceptedAssignments.length}</p>
            </div>
            <CheckCircle2 size={32} className="text-emerald-200" />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-700 font-medium mb-1">Pending</p>
              <p className="text-2xl font-bold text-amber-700">{pendingAssignments.length}</p>
            </div>
            <Clock size={32} className="text-amber-200" />
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-rose-700 font-medium mb-1">Rejected</p>
              <p className="text-2xl font-bold text-rose-700">{rejectedAssignments.length}</p>
            </div>
            <XCircle size={32} className="text-rose-200" />
          </div>
        </div>

        {/* Assignments List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Personnel</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role & Duty</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeAssignments.map(a => (
                <tr key={a._id} className={a.status === 'REJECTED' ? 'bg-rose-50/30' : ''}>
                  <td className="p-4">
                    <p className="font-bold text-slate-900">{a.userId?.name}</p>
                    <p className="text-xs text-slate-500">{a.userId?.teamId?.name}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-slate-700">{a.dutyType}</p>
                    <p className="text-xs text-slate-500 capitalize">{a.role}</p>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      a.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700' :
                      a.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {a.status}
                    </span>
                    {a.status === 'REJECTED' && (
                      <p className="text-xs text-rose-600 mt-1 flex items-start gap-1">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        {a.responseHistory.find(h => h.action === 'REJECTED')?.reason}
                      </p>
                    )}
                  </td>
                  <td className="p-4">
                    {a.status === 'REJECTED' && (
                      <button 
                        onClick={() => handleOpenReassign(a._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
                      >
                        <RefreshCw size={14} /> Reassign
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reassign Modal */}
      {reassigningId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                <RefreshCw size={18} /> Reassign Duty
              </h3>
              <button onClick={() => setReassigningId(null)} className="text-indigo-400 hover:text-indigo-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              {loadingPersonnel ? (
                <div className="text-center text-slate-500 py-4">Loading personnel...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select New Personnel</label>
                    <select 
                      value={newUserId} 
                      onChange={e => setNewUserId(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">-- Choose Faculty/HOD --</option>
                      {availablePersonnel
                        .filter(p => !activeAssignments.some(a => a.userId?._id === p._id)) // Don't show already assigned
                        .map(p => (
                          <option key={p._id} value={p._id}>{p.name} ({p.teamId?.name || 'No Dept'})</option>
                        ))}
                    </select>
                  </div>
                  
                  {reassignError && (
                    <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-lg flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5"/> {reassignError}
                    </div>
                  )}

                  <div className="pt-2 flex gap-3">
                    <button 
                      onClick={() => setReassigningId(null)}
                      className="flex-1 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={submitReassign}
                      disabled={submittingReassign || !newUserId}
                      className="flex-1 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {submittingReassign ? 'Reassigning...' : 'Confirm Reassign'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

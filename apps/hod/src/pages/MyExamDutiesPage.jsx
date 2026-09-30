import { useState, useEffect } from 'react';
import { 
  GraduationCap, Calendar as CalendarIcon, Clock, MapPin, 
  CheckCircle2, XCircle, AlertCircle, Info, ChevronRight 
} from 'lucide-react';
import api from '../lib/api';

export default function MyExamDutiesPage() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // For rejection modal
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Geolocation for reporting
  const [reportingId, setReportingId] = useState(null);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const res = await api.get('/exam-duties/my-duties');
      setAssignments(res.data.data.assignments || []);
    } catch (error) {
      console.error('Failed to fetch exam duties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (id, action, reason = '') => {
    setSubmitting(true);
    try {
      await api.post(`/exam-duties/assignments/${id}/respond`, { action, reason });
      await fetchAssignments(); // Refresh list
      setRejectingId(null);
      setRejectReason('');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to respond to assignment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReport = async (id) => {
    setReportingId(id);
    try {
      await api.post(`/exam-duties/assignments/${id}/report`, {});
      alert('Successfully reported for duty!');
      await fetchAssignments();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to report for duty.');
    } finally {
      setReportingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading your exam duties...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="text-primary-600" /> My Exam Duties
          </h1>
          <p className="text-slate-500 mt-1">Review and respond to your assigned examination duties.</p>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No Pending Duties</h3>
          <p className="text-slate-500 max-w-sm">You do not have any examination duties assigned to you at the moment.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {assignments.map(assignment => {
            const duty = assignment.examDutyId;
            if (!duty) return null; // Defensive check
            
            const isPending = assignment.status === 'PENDING';
            const isAccepted = assignment.status === 'ACCEPTED';
            const isRejected = assignment.status === 'REJECTED';
            
            return (
              <div key={assignment._id} className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:border-primary-200/50 transition-all duration-300 overflow-hidden">
                {/* Decorative glowing gradient behind the card */}
                {isPending && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />}
                {isAccepted && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />}
                {isRejected && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 to-red-400" />}

                {/* Header row */}
                <div className="p-6 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{duty.examName}</h3>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold tracking-wide shadow-sm">{duty.course}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-sm text-slate-600 font-semibold">{duty.subject}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-sm text-slate-600 font-semibold">Semester {duty.semester}</span>
                    </div>
                  </div>
                  <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-2">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${
                      isPending ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/50' :
                      isAccepted ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/50' :
                      isRejected ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/50' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {assignment.status}
                    </span>
                    <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100/80 shadow-sm">
                      Assigned as: <span className="text-slate-800 font-bold">{assignment.dutyType}</span>
                    </span>
                  </div>
                </div>

                {/* Details grid */}
                <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gradient-to-b from-transparent to-slate-50/50 relative">
                  <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-50" />
                  
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group/item">
                    <div className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 rounded-xl shrink-0 shadow-inner group-hover/item:scale-110 transition-transform">
                      <CalendarIcon size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">Date</p>
                      <p className="text-sm font-bold text-slate-800">
                        {new Date(duty.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-amber-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group/item">
                    <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 rounded-xl shrink-0 shadow-inner group-hover/item:scale-110 transition-transform">
                      <Clock size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1.5">Timing</p>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]"></span>
                          Report: <span className="font-semibold text-slate-600">{new Date(duty.reportingTime).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' })}</span>
                        </p>
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          Exam: <span className="font-semibold text-slate-600">{new Date(duty.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' })} - {new Date(duty.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' })}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group/item">
                    <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 rounded-xl shrink-0 shadow-inner group-hover/item:scale-110 transition-transform">
                      <MapPin size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">Location</p>
                      <p className="text-base font-black text-slate-800 leading-none mb-2">{duty.location.room}</p>
                      <p className="text-xs text-slate-600 font-semibold bg-slate-100 inline-block px-2.5 py-1 rounded-md border border-slate-200/50">
                        {duty.location.building} • {duty.location.campus}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                {isPending && (
                  <div className="p-5 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100 flex items-center justify-end gap-3 relative overflow-hidden">
                    {/* Subtle gradient background for the action bar */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-50/30 to-amber-100/20" />
                    
                    {rejectingId === assignment._id ? (
                      <div className="flex items-center gap-3 w-full animate-in fade-in slide-in-from-right-4 relative z-10">
                        <input 
                          type="text" 
                          placeholder="Please provide a valid reason for rejection..." 
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="flex-1 p-3 border-2 border-rose-200 rounded-xl focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 outline-none text-sm transition-all shadow-sm font-medium"
                          autoFocus
                        />
                        <button 
                          onClick={() => setRejectingId(null)}
                          className="px-5 py-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-bold text-sm transition-all shadow-sm"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleRespond(assignment._id, 'REJECTED', rejectReason)}
                          disabled={!rejectReason.trim() || submitting}
                          className="px-6 py-3 text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 rounded-xl font-bold text-sm transition-all disabled:opacity-50 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    ) : (
                      <div className="relative z-10 flex gap-3">
                        <button 
                          onClick={() => setRejectingId(assignment._id)}
                          className="px-6 py-2.5 text-rose-600 bg-white border border-rose-100 hover:bg-rose-50 hover:border-rose-200 rounded-xl font-bold text-sm transition-all shadow-sm"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleRespond(assignment._id, 'ACCEPTED')}
                          disabled={submitting}
                          className="px-8 py-2.5 text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                          <CheckCircle2 size={18} strokeWidth={2.5} /> Accept Duty
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {isAccepted && assignment.presenceStatus === 'PENDING' && (
                  <div className="p-5 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100 flex items-center justify-end relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-50/30 to-indigo-100/20" />
                    <button 
                      onClick={() => handleReport(assignment._id)}
                      disabled={reportingId === assignment._id}
                      className="relative z-10 px-8 py-3 text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-75 disabled:hover:translate-y-0"
                    >
                      <MapPin size={18} strokeWidth={2.5} /> 
                      {reportingId === assignment._id ? 'Reporting...' : 'Report for Duty'}
                    </button>
                  </div>
                )}

                {isAccepted && assignment.presenceStatus === 'REPORTED' && (
                  <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-100 flex items-center justify-between group/reported relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    <div className="flex items-center gap-3 text-emerald-800 text-sm pl-2">
                      <div className="p-1.5 bg-emerald-100 rounded-full text-emerald-600">
                        <CheckCircle2 size={16} strokeWidth={3} />
                      </div>
                      <p className="font-medium">
                        You have successfully reported for this duty at <strong className="font-black tracking-wide bg-emerald-100/50 px-2 py-0.5 rounded">{new Date(assignment.reportedAt).toLocaleTimeString()}</strong>
                      </p>
                    </div>
                  </div>
                )}
                
                {isRejected && (
                  <div className="p-4 bg-gradient-to-r from-rose-50 to-orange-50 border-t border-rose-100 flex items-start gap-3 text-sm text-rose-800 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                    <div className="p-1.5 bg-rose-100 rounded-full text-rose-600 shrink-0 ml-2 mt-0.5">
                      <AlertCircle size={16} strokeWidth={2.5} />
                    </div>
                    <div>
                      <span className="font-black uppercase tracking-wider text-[11px] block mb-0.5 opacity-80">Rejection Reason</span>
                      <span className="font-medium">{assignment.responseHistory.find(h => h.action === 'REJECTED')?.reason}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

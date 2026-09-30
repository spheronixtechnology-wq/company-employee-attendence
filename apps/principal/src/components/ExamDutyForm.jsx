import React, { useState, useEffect } from 'react';
import { 
  X, Check, AlertTriangle, Search, Clock, Calendar as CalendarIcon, 
  MapPin, BookOpen, GraduationCap, Users, UserPlus, FileText, ChevronRight, CheckCircle2 
} from 'lucide-react';
import api from '../lib/api';

export default function ExamDutyForm({ onCancel, onSuccess }) {
  const [step, setStep] = useState(1);
  
  // Step 1: Exam Details
  const [examName, setExamName] = useState('');
  const [examType, setExamType] = useState('End Semester');
  const [subject, setSubject] = useState('');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('');
  
  // Step 2: Time & Location
  const [date, setDate] = useState('');
  const [session, setSession] = useState('Morning');
  const [reportingTime, setReportingTime] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [campus, setCampus] = useState('');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  
  // Step 3: Personnel Selection
  const [availablePersonnel, setAvailablePersonnel] = useState([]);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersonnel, setSelectedPersonnel] = useState([]); // [{ userId, role, dutyType }]
  const [conflicts, setConflicts] = useState([]); // Array of conflict objects from backend
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch personnel on mount
  useEffect(() => {
    const fetchPersonnel = async () => {
      setLoadingPersonnel(true);
      try {
        const res = await api.get('/exam-duties/personnel');
        setAvailablePersonnel(res.data.data.personnel || []);
      } catch (err) {
        console.error('Failed to fetch personnel:', err);
      } finally {
        setLoadingPersonnel(false);
      }
    };
    fetchPersonnel();
  }, []);

  // Conflict checker hook
  useEffect(() => {
    if (selectedPersonnel.length === 0 || !date || !startTime || !endTime) {
      setConflicts([]);
      return;
    }

    const checkConflicts = async () => {
      setCheckingConflicts(true);
      try {
        // Construct full datetime strings for backend comparison
        const fullStartTime = new Date(`${date}T${startTime}`).toISOString();
        const fullEndTime = new Date(`${date}T${endTime}`).toISOString();
        
        const res = await api.post('/exam-duties/conflicts', {
          userIds: selectedPersonnel.map(p => p.userId),
          startTime: fullStartTime,
          endTime: fullEndTime
        });
        
        setConflicts(res.data.data.conflicts || []);
      } catch (err) {
        console.error('Conflict check failed', err);
      } finally {
        setCheckingConflicts(false);
      }
    };

    const timer = setTimeout(checkConflicts, 800); // debounce
    return () => clearTimeout(timer);
  }, [selectedPersonnel, date, startTime, endTime]);

  const handleTogglePersonnel = (user) => {
    const isSelected = selectedPersonnel.some(p => p.userId === user._id);
    if (isSelected) {
      setSelectedPersonnel(prev => prev.filter(p => p.userId !== user._id));
    } else {
      setSelectedPersonnel(prev => [...prev, { 
        userId: user._id, 
        role: user.role, 
        dutyType: 'Invigilator' // Default duty
      }]);
    }
  };

  const updateDutyType = (userId, dutyType) => {
    setSelectedPersonnel(prev => prev.map(p => 
      p.userId === userId ? { ...p, dutyType } : p
    ));
  };

  const getConflictForUser = (userId) => {
    return conflicts.find(c => c.userId === userId);
  };

  const handleSubmit = async () => {
    if (conflicts.length > 0) {
      setError('Please resolve the highlighted conflicts before publishing.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        examName,
        examType,
        subject,
        course,
        semester,
        date: new Date(date).toISOString(),
        session,
        reportingTime: new Date(`${date}T${reportingTime}`).toISOString(),
        startTime: new Date(`${date}T${startTime}`).toISOString(),
        endTime: new Date(`${date}T${endTime}`).toISOString(),
        location: { campus, building, room },
        instructions,
        assignments: selectedPersonnel
      };

      await api.post('/exam-duties', payload);
      onSuccess();
    } catch (err) {
      console.error(err);
      // If backend returns conflicts (409), surface them as visual badges on the cards
      if (err.response?.status === 409 && err.response?.data?.data?.conflicts?.length > 0) {
        setConflicts(err.response.data.data.conflicts);
        setError('Conflicts were detected. Please remove the highlighted personnel and try again.');
      } else {
        setError(err.response?.data?.message || 'Failed to create exam duty');
      }
      setSubmitting(false);
    }
  };


  const filteredPersonnel = availablePersonnel.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.teamId?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <GraduationCap className="text-primary-600" />
          Create New Exam Duty
        </h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Stepper Progress */}
      <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        {[
          { num: 1, label: 'Exam Details', icon: BookOpen },
          { num: 2, label: 'Time & Location', icon: MapPin },
          { num: 3, label: 'Assign Personnel', icon: Users },
        ].map((s) => (
          <div key={s.num} className={`flex items-center gap-2 ${step === s.num ? 'text-primary-600' : step > s.num ? 'text-emerald-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
              step === s.num ? 'bg-primary-100' : step > s.num ? 'bg-emerald-100' : 'bg-slate-100'
            }`}>
              {step > s.num ? <Check size={16} /> : <s.icon size={16} />}
            </div>
            <span className={`text-sm font-medium ${step >= s.num ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
            {s.num < 3 && <ChevronRight size={16} className="mx-2 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
        
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Exam Name</label>
              <input type="text" value={examName} onChange={e => setExamName(e.target.value)} placeholder="e.g. B.Tech End Semester Examination" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exam Type</label>
                <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none">
                  <option>End Semester</option>
                  <option>Mid Semester</option>
                  <option>Internal Assessment</option>
                  <option>Practical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course / Program</label>
                <input type="text" value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. B.Tech CSE" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Machine Learning" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                <input type="text" value={semester} onChange={e => setSemester(e.target.value)} placeholder="e.g. VII" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exam Date</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full pl-10 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
                <select value={session} onChange={e => setSession(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none">
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Full Day</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 bg-primary-50 rounded-xl border border-primary-100">
              <div>
                <label className="block text-xs font-semibold text-primary-700 mb-1 uppercase tracking-wider">Reporting Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" size={16} />
                  <input type="time" value={reportingTime} onChange={e => setReportingTime(e.target.value)} className="w-full pl-9 p-2 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-primary-700 mb-1 uppercase tracking-wider">Exam Start</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" size={16} />
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full pl-9 p-2 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-primary-700 mb-1 uppercase tracking-wider">Exam End</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" size={16} />
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full pl-9 p-2 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm" required />
                </div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800 pt-2 border-t border-slate-200">Location Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campus</label>
                <input type="text" value={campus} onChange={e => setCampus(e.target.value)} placeholder="Main Campus" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Block / Building</label>
                <input type="text" value={building} onChange={e => setBuilding(e.target.value)} placeholder="A Block" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Room</label>
                <input type="text" value={room} onChange={e => setRoom(e.target.value)} placeholder="A-204" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Special Instructions (Optional)</label>
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Enter any specific instructions for the assigned personnel..." className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none h-24" />
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col">
            <div className="flex gap-6 h-full">
              {/* Left Side: Selection Pool */}
              <div className="w-1/2 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-3 border-b border-slate-200 bg-slate-50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search faculty and HODs..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {loadingPersonnel ? (
                    <div className="p-8 text-center text-slate-500 text-sm">Loading available personnel...</div>
                  ) : filteredPersonnel.map(user => {
                    const isSelected = selectedPersonnel.some(p => p.userId === user._id);
                    return (
                      <div 
                        key={user._id} 
                        onClick={() => handleTogglePersonnel(user)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-primary-50 border border-primary-200' 
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div>
                          <p className={`font-medium text-sm ${isSelected ? 'text-primary-900' : 'text-slate-800'}`}>{user.name}</p>
                          <p className="text-xs text-slate-500">{user.designation} • {user.teamId?.name || 'No Dept'}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 text-transparent'
                        }`}>
                          <Check size={14} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Side: Selected & Conflicts */}
              <div className="w-1/2 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-500" size={18} />
                    Selected Personnel ({selectedPersonnel.length})
                  </h3>
                  {checkingConflicts && <span className="text-xs text-amber-600 font-medium animate-pulse">Checking conflicts...</span>}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3">
                  {selectedPersonnel.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <UserPlus size={32} className="mb-2 opacity-50" />
                      <p className="text-sm">Select personnel from the left list to assign them to this duty.</p>
                    </div>
                  ) : (
                    selectedPersonnel.map(sel => {
                      const user = availablePersonnel.find(p => p._id === sel.userId);
                      const conflict = getConflictForUser(sel.userId);
                      
                      return (
                        <div key={sel.userId} className={`p-3 rounded-xl border ${conflict ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{user?.name}</p>
                              <p className="text-xs text-slate-500">{user?.teamId?.name}</p>
                            </div>
                            <button onClick={() => handleTogglePersonnel(user)} className="text-slate-400 hover:text-rose-500">
                              <X size={16} />
                            </button>
                          </div>
                          
                          <select 
                            value={sel.dutyType} 
                            onChange={(e) => updateDutyType(sel.userId, e.target.value)}
                            className="w-full text-sm p-1.5 border border-slate-200 rounded-lg bg-slate-50 outline-none mb-2 focus:ring-1 focus:ring-primary-500"
                          >
                            <option>Invigilator</option>
                            <option>Chief Superintendent</option>
                            <option>Deputy Superintendent</option>
                            <option>Reliever</option>
                            <option>Examination Squad</option>
                            <option>Support Staff</option>
                          </select>

                          {conflict && (
                            <div className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-100/50 p-2 rounded-md">
                              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                              <span><strong className="font-semibold">{conflict.type}:</strong> {conflict.reason}</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
        {error && <div className="text-rose-600 text-sm font-medium flex items-center gap-1"><AlertTriangle size={16}/> {error}</div>}
        {!error && <div></div>}
        
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="px-5 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">
              Back
            </button>
          )}
          
          {step < 3 ? (
            <button 
              onClick={() => {
                if (step === 1 && (!examName || !course || !subject || !semester)) {
                  setError("Please fill all fields."); return;
                }
                if (step === 2 && (!date || !startTime || !endTime || !campus || !building || !room)) {
                  setError("Please fill time and location details."); return;
                }
                setError(null);
                setStep(step + 1);
              }} 
              className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium transition-colors flex items-center gap-2"
            >
              Continue
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={submitting || conflicts.length > 0 || selectedPersonnel.length === 0}
              className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-emerald-600/20"
            >
              {submitting ? 'Publishing...' : 'Publish Exam Duty'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

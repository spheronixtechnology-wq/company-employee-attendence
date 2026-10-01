import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, Play, CheckCircle, AlertTriangle, ArrowRight, Save, Layout, Users, GraduationCap, X, Sparkles, Trash2 } from 'lucide-react';
import api from '../lib/api';

export default function ExamAllocationManager() {
  const [exams, setExams] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [violations, setViolations] = useState([]);
  const [previewData, setPreviewData] = useState(null);

  // New Exam Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newExam, setNewExam] = useState({ name: '', session: 'FN', date: '', startTime: '09:00', endTime: '12:00' });

  // File Upload State
  const [files, setFiles] = useState({ students: null, rooms: null, faculty: null });
  const [invigilatorsPerRoom, setInvigilatorsPerRoom] = useState(1);
  const [isReuploading, setIsReuploading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, examId: null });

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await api.get('/exams');
      const data = res.data.data;
      setExams(data);
      if (activeExam) {
        const updated = data.find(e => e._id === activeExam._id);
        if (updated) setActiveExam(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    setError(null);
    setViolations([]);
    try {
      setLoading(true);
      const res = await api.post('/exams/create', newExam);
      setExams([res.data.data, ...exams]);
      setShowCreateForm(false);
      setNewExam({ name: '', session: 'FN', date: '', startTime: '09:00', endTime: '12:00' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create exam');
      if (err.response?.data?.violations) setViolations(err.response.data.violations);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFiles = async (examId) => {
    setError(null);
    setViolations([]);
    if (!files.students || !files.rooms || !files.faculty) {
      setError('Please select all three files');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('students', files.students);
      formData.append('rooms', files.rooms);
      formData.append('faculty', files.faculty);

      await api.post(`/exams/${examId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      fetchExams();
      setActiveExam(null); // refresh view
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
      if (err.response?.data?.violations) {
        setViolations(err.response.data.violations);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async (examId) => {
    setError(null);
    setViolations([]);
    try {
      setLoading(true);
      await api.post(`/exams/${examId}/generate`, { invigilatorsPerRoom });
      
      // explicitly update the active exam immediately
      setActiveExam(prev => ({ ...prev, status: 'GENERATED' }));
      fetchExams();
    } catch (err) {
      setError(err.response?.data?.message || 'Generation failed');
      if (err.response?.data?.violations) {
        setViolations(err.response.data.violations);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPreview = async (examId) => {
    try {
      setLoading(true);
      const res = await api.get(`/exams/${examId}/preview`);
      setPreviewData(res.data.data);
    } catch (err) {
      alert('Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishPlan = async (examId) => {
    try {
      setLoading(true);
      await api.post(`/exams/${examId}/publish`);
      alert('Plan published successfully! Faculty can now see their duties.');
      fetchExams();
    } catch (err) {
      alert('Failed to publish plan');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = (examId) => {
    setConfirmDialog({ isOpen: true, examId });
  };

  const confirmDelete = async () => {
    const examId = confirmDialog.examId;
    setConfirmDialog({ isOpen: false, examId: null });
    try {
      setLoading(true);
      await api.delete(`/exams/${examId}`);
      if (activeExam && activeExam._id === examId) {
        setActiveExam(null);
        setPreviewData(null);
      }
      fetchExams();
    } catch (err) {
      alert('Failed to delete exam');
    } finally {
      setLoading(false);
    }
  };

  const renderExamDetails = (exam) => {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex justify-between items-center pb-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{exam.name}</h2>
            <p className="text-slate-500 text-sm">Session: {exam.session} • Status: {exam.status}</p>
          </div>
          <button onClick={() => setActiveExam(null)} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-0.5 text-red-500" size={18} />
            <div className="w-full">
              <p className="text-sm font-bold mb-1">{error}</p>
              {violations.length > 0 && (
                <ul className="list-disc pl-5 text-sm space-y-1 mt-2 text-red-600">
                  {violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {(exam.status === 'DRAFT' || isReuploading) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Upload size={18} className="text-primary-600" />
                Upload Master Data
              </h3>
              {exam.status !== 'DRAFT' && (
                <button onClick={() => setIsReuploading(false)} className="text-sm text-slate-500 hover:text-slate-700 underline">Cancel Re-upload</button>
              )}
            </div>
            <p className="text-sm text-slate-500">Upload the three master Excel sheets to initialize the constraint engines. 
              <span className="ml-2 font-medium text-primary-600">Download templates: 
                <a href={`${api.defaults.baseURL}/public/templates/sample_students.xlsx`} className="ml-2 hover:underline" download>Students</a> • 
                <a href={`${api.defaults.baseURL}/public/templates/sample_rooms.xlsx`} className="ml-2 hover:underline" download>Rooms</a> • 
                <a href={`${api.defaults.baseURL}/public/templates/sample_faculty.xlsx`} className="ml-2 hover:underline" download>Faculty</a>
              </span>
            </p>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors relative cursor-pointer">
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".xlsx,.xls" onChange={(e) => setFiles({...files, students: e.target.files[0]})} />
                <Users className="mx-auto mb-2 text-blue-500" />
                <p className="text-sm font-medium text-slate-700">{files.students ? files.students.name : 'Student List'}</p>
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors relative cursor-pointer">
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".xlsx,.xls" onChange={(e) => setFiles({...files, rooms: e.target.files[0]})} />
                <Layout className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-medium text-slate-700">{files.rooms ? files.rooms.name : 'Room Capacities'}</p>
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors relative cursor-pointer">
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".xlsx,.xls" onChange={(e) => setFiles({...files, faculty: e.target.files[0]})} />
                <GraduationCap className="mx-auto mb-2 text-purple-500" />
                <p className="text-sm font-medium text-slate-700">{files.faculty ? files.faculty.name : 'Faculty List'}</p>
              </div>
            </div>
            
            <div className="mt-6 bg-slate-100 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <label className="block text-sm font-bold text-slate-800">Faculty per Room (Invigilators)</label>
                <p className="text-xs text-slate-500 mt-1">Specify how many faculty members should be assigned to each room during generation.</p>
              </div>
              <input 
                type="number" 
                min="1" 
                max="5"
                value={invigilatorsPerRoom}
                onChange={(e) => setInvigilatorsPerRoom(parseInt(e.target.value) || 1)}
                className="px-4 py-2 border border-slate-300 rounded-md w-24 text-center font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            
            <button 
              onClick={() => {
                handleUploadFiles(exam._id);
                setIsReuploading(false);
              }}
              disabled={loading}
              className="mt-4 w-full bg-slate-900 text-white rounded-lg py-3 flex items-center justify-center gap-2 font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              <CheckCircle size={18} />
              Validate & Save Data
            </button>
          </div>
        )}

        {exam.status === 'VALIDATED' && !isReuploading && (
          <div className="text-center py-8 space-y-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Data Validated Successfully</h3>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">The master data is fully validated. The constraint engines are ready to generate the randomized seating plan and assignments.</p>
            </div>
            <div className="flex justify-center gap-4">
              <button 
                onClick={() => setIsReuploading(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium shadow-sm hover:bg-slate-50 transition-all"
              >
                <Upload size={18} />
                Re-Upload Data
              </button>
              <button 
                onClick={() => handleGeneratePlan(exam._id)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium shadow-md hover:bg-primary-700 hover:shadow-lg transition-all disabled:opacity-50"
              >
                <Play size={18} />
                Run Allocation Engines
              </button>
            </div>
          </div>
        )}

        {exam.status === 'GENERATED' && !isReuploading && (
          <div className="text-center py-8 space-y-4 bg-primary-50 rounded-lg border border-primary-100">
            <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto">
              <Sparkles size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary-900">Seating Plan Generated!</h3>
              <p className="text-primary-700 mt-1 max-w-sm mx-auto">The algorithms have successfully compiled a conflict-free seating layout.</p>
            </div>
            <div className="flex justify-center gap-4 mt-4">
               <button 
                 onClick={() => setIsReuploading(true)}
                 className="px-6 py-2 bg-white text-slate-600 font-medium rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
               >
                 <Upload size={16} /> Re-Upload Data
               </button>
               <button 
                 onClick={() => fetchPreview(exam._id)}
                 className="px-6 py-2 bg-white text-primary-600 font-medium rounded-lg shadow-sm border border-primary-200 hover:bg-primary-50"
               >
                 Preview Layouts
               </button>
               <button 
                 onClick={() => handlePublishPlan(exam._id)}
                 className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg shadow-md hover:bg-primary-700"
               >
                 Finalize & Publish
               </button>
            </div>
          </div>
        )}

        {exam.status === 'PUBLISHED' && (
          <div className="text-center py-8 space-y-4 bg-indigo-50 rounded-lg border border-indigo-100">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-indigo-900">Exam Published!</h3>
              <p className="text-indigo-700 mt-1 max-w-lg mx-auto">
                This exam has been finalized and published. Faculty can now view their invigilation duties on their dashboard, and you can export the student notice boards.
              </p>
            </div>
            <div className="flex justify-center gap-4 mt-4">
               <button 
                 onClick={() => fetchPreview(exam._id)}
                 className="px-6 py-2 bg-white text-indigo-600 font-medium rounded-lg shadow-sm border border-indigo-200 hover:bg-indigo-50"
               >
                 View Layouts & Downloads
               </button>
            </div>
          </div>
        )}

        {previewData && (
          <div className="mt-8 border-t pt-6 space-y-6 animate-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">Seating Preview</h3>
              <div className="flex gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-slate-500 uppercase mb-1">Invigilator Reports</span>
                  <div className="flex gap-2">
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/pdf`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100 text-sm font-medium">Download PDF</button>
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/word`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 text-sm font-medium">Download Word</button>
                  </div>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div className="flex flex-col items-start">
                  <span className="text-xs font-semibold text-slate-500 uppercase mb-1">Student Notice Board</span>
                  <div className="flex gap-2">
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/students/pdf`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100 text-sm font-medium">Student PDF</button>
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/students/word`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100 text-sm font-medium">Student Word</button>
                  </div>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div className="flex flex-col items-start">
                  <span className="text-xs font-semibold text-slate-500 uppercase mb-1">Faculty Duty Chart</span>
                  <div className="flex gap-2">
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/faculty/pdf`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200 hover:bg-purple-100 text-sm font-medium">Duty PDF</button>
                    <button onClick={() => window.open(`${api.defaults.baseURL}/exams/${exam._id}/export/faculty/word`, '_blank')} className="flex items-center gap-2 px-3 py-1 bg-fuchsia-50 text-fuchsia-700 rounded border border-fuchsia-200 hover:bg-fuchsia-100 text-sm font-medium">Duty Word</button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              {Object.keys(previewData).map(roomNumber => {
                const room = previewData[roomNumber];
                
                // Calculate branch counts
                const branchCounts = {};
                room.seats.forEach(s => {
                  if (!s.isEmptySeat && s.branch) {
                    branchCounts[s.branch] = (branchCounts[s.branch] || 0) + 1;
                  }
                });

                return (
                  <div key={roomNumber} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    {/* Header Summary */}
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Layout className="text-primary-500" /> Room {roomNumber}</h4>
                        <div className="text-sm font-medium text-slate-600 bg-white px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2">
                          <Users size={16} className="text-slate-400" />
                          <span>{room.seats.filter(s => !s.isEmptySeat).length} / {room.capacity} Seats Filled</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-3 rounded border border-slate-200">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Invigilators</p>
                          {room.invigilators.length > 0 ? (
                            <ul className="text-sm font-medium text-slate-700 space-y-1">
                              {room.invigilators.map((inv, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500"></div>
                                  {inv.name} <span className="text-slate-400 font-normal">({inv.department})</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-red-500 italic">None Assigned</p>
                          )}
                        </div>
                        <div className="bg-white p-3 rounded border border-slate-200">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Branch Breakdown</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(branchCounts).map(([branch, count]) => (
                              <div key={branch} className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2">
                                {branch} <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-sm">{count}</span>
                              </div>
                            ))}
                            {Object.keys(branchCounts).length === 0 && <span className="text-sm text-slate-400 italic">No students</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* True 2D Classroom Grid */}
                    <div className="p-6 bg-slate-100 overflow-x-auto">
                      <div className="min-w-max mx-auto border-4 border-slate-300 rounded-xl p-8 bg-white relative shadow-inner">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-slate-300 text-slate-600 text-xs font-bold uppercase tracking-widest px-4 py-1 rounded-b-lg">
                          Chalkboard / Front
                        </div>
                        
                        <div 
                          className="mt-6 grid gap-4" 
                          style={{ gridTemplateColumns: `repeat(${room.columns}, minmax(100px, 1fr))` }}
                        >
                          {/* Create exactly rows * columns grid cells */}
                          {Array.from({ length: room.rows * room.columns }).map((_, index) => {
                            const r = Math.floor(index / room.columns);
                            const c = index % room.columns;
                            // Find student assigned to this specific coordinate
                            const seat = room.seats.find(s => s.row === r && s.column === c);

                            if (!seat || seat.isEmptySeat) {
                              return (
                                <div key={index} className="h-20 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 flex flex-col items-center justify-center text-slate-300">
                                  <span className="text-[10px] font-bold">R{r} C{c}</span>
                                  <span className="text-xs italic mt-1">Empty Desk</span>
                                </div>
                              );
                            }

                            // Dynamic branch color logic (robust hash)
                            const getBranchColor = (branchStr) => {
                              if (!branchStr) return 'bg-slate-50 border-slate-200 text-slate-700';
                              const colors = [
                                'bg-blue-50 border-blue-300 text-blue-800', 
                                'bg-emerald-50 border-emerald-300 text-emerald-800', 
                                'bg-purple-50 border-purple-300 text-purple-800', 
                                'bg-amber-50 border-amber-300 text-amber-800', 
                                'bg-rose-50 border-rose-300 text-rose-800',
                                'bg-cyan-50 border-cyan-300 text-cyan-800',
                                'bg-indigo-50 border-indigo-300 text-indigo-800',
                                'bg-orange-50 border-orange-300 text-orange-800',
                                'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-800',
                                'bg-lime-50 border-lime-300 text-lime-800'
                              ];
                              let hash = 0;
                              for (let i = 0; i < branchStr.length; i++) {
                                hash = branchStr.charCodeAt(i) + ((hash << 5) - hash);
                              }
                              return colors[Math.abs(hash) % colors.length];
                            };
                            
                            const theme = getBranchColor(seat.branch);

                            return (
                              <div key={index} className={`h-20 border-2 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-sm relative transition-transform hover:scale-105 cursor-default ${theme}`}>
                                <span className="absolute top-1 left-1.5 text-[8px] font-bold opacity-50">R{r} C{c}</span>
                                <span className="font-bold text-sm tracking-tight">{seat.rollNumber}</span>
                                <span className="text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded bg-white/60 shadow-sm uppercase">{seat.branch}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Premium Delete Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Exam Plan</h3>
              <p className="text-slate-500 mb-6">
                Are you absolutely sure you want to delete this exam plan? This action cannot be undone and will permanently remove all associated student seating and invigilator duties.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDialog({ isOpen: false, examId: null })}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm shadow-red-200"
                >
                  Yes, delete plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exam Management & Seating</h1>
          <p className="text-slate-500">Automated allocation algorithms for exam duties and room seating.</p>
        </div>
        <button 
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          <FileSpreadsheet size={18} />
          New Exam Plan
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateExam} className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 animate-in slide-in-from-top-2">
          <h3 className="font-bold text-slate-800">Initialize New Exam Plan</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Exam Name</label>
              <input required type="text" value={newExam.name} onChange={e => setNewExam({...newExam, name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. End Semester 2026" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input required type="date" value={newExam.date} onChange={e => setNewExam({...newExam, date: e.target.value})} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
              <select value={newExam.session} onChange={e => setNewExam({...newExam, session: e.target.value})} className="w-full p-2 border rounded-md bg-white">
                <option value="FN">Forenoon (FN)</option>
                <option value="AN">Afternoon (AN)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
              <input required type="time" value={newExam.startTime} onChange={e => setNewExam({...newExam, startTime: e.target.value})} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
              <input required type="time" value={newExam.endTime} onChange={e => setNewExam({...newExam, endTime: e.target.value})} className="w-full p-2 border rounded-md" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-md">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-slate-900 text-white font-medium rounded-md hover:bg-slate-800">Save Draft</button>
          </div>
        </form>
      )}

      {activeExam ? (
        renderExamDetails(activeExam)
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Exam Name</th>
                <th className="px-6 py-4">Session</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    No exam plans created yet.
                  </td>
                </tr>
              ) : exams.map((exam) => (
                <tr key={exam._id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{exam.name}</td>
                  <td className="px-6 py-4 text-slate-600">{exam.session}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                      exam.status === 'DRAFT' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                      exam.status === 'VALIDATED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      exam.status === 'GENERATED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {exam.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium text-sm">
                    {new Date(exam.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-4">
                    <button 
                      onClick={() => { setError(null); setActiveExam(exam); setPreviewData(null); setIsReuploading(false); }}
                      className="text-primary-600 hover:text-primary-800 font-medium inline-flex items-center gap-1"
                    >
                      Manage <ArrowRight size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteExam(exam._id)}
                      className="text-red-400 hover:text-red-600 p-1"
                      title="Delete Exam"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}

// Ensure you import Sparkles icon from lucide-react if using this snippet
// import { Sparkles } from 'lucide-react';

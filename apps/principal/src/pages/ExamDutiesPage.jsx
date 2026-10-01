import { useState, useEffect } from 'react';
import { Plus, FileSpreadsheet, Search, Calendar as CalendarIcon, MapPin, Clock, Users, ChevronRight, GraduationCap, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import ExamDutyForm from '../components/ExamDutyForm';
import ExamDutyImportWizard from '../components/ExamDutyImportWizard';
import ExamAllocationManager from '../components/ExamAllocationManager';

export default function ExamDutiesPage() {
  const [activeTab, setActiveTab] = useState('ALLOCATION'); // 'ALLOCATION' or 'DUTIES'
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(true);

  // We will build the creation form in the next step, for now, just the placeholder and list
  const [isCreating, setIsCreating]   = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const navigate = useNavigate();

  const fetchDuties = async () => {
    try {
      const res = await api.get('/exam-duties');
      setDuties(res.data.data.examDuties || []);
    } catch (err) {
      console.error('Failed to fetch duties', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuties();
  }, []);

  if (isCreating) {
    return (
      <div className="p-6">
        <ExamDutyForm 
          onCancel={() => setIsCreating(false)} 
          onSuccess={() => {
            setIsCreating(false);
            fetchDuties();
          }} 
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('ALLOCATION')} 
          className={`px-6 py-3 font-medium text-sm ${activeTab === 'ALLOCATION' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Exam & Seating Allocation
        </button>
        {/* 
        <button 
          onClick={() => setActiveTab('DUTIES')} 
          className={`px-6 py-3 font-medium text-sm ${activeTab === 'DUTIES' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Duty Attendance Tracking
        </button> 
        */}
      </div>

      {activeTab === 'ALLOCATION' ? (
        <ExamAllocationManager />
      ) : (
      <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="text-primary-600" /> Duty Attendance Tracking
          </h1>
          <p className="text-slate-500 mt-1">Manage physical attendance for exam invigilators.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImporting(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <FileSpreadsheet size={18} className="text-emerald-600" />
            Import Excel
          </button>
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Create Exam Duty
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search duties..." 
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none w-64 text-sm"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading exam duties...</div>
        ) : duties.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mb-4">
              <Calendar size={32} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No Exam Duties Found</h3>
            <p className="text-slate-500 mb-6 max-w-sm">You haven't created any examination duties yet. Click the button below to schedule your first exam duty.</p>
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium"
            >
              <Plus size={18} />
              Create Exam Duty
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {duties.map(duty => (
              <div key={duty._id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{duty.examName}</h3>
                    <p className="text-sm text-slate-500">{duty.course} • {duty.subject} • Sem {duty.semester}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs font-medium text-slate-400">
                      <span className="flex items-center gap-1"><Clock size={14}/> {new Date(duty.date).toLocaleDateString()} {duty.session}</span>
                      <span className="flex items-center gap-1"><MapPin size={14}/> {duty.location.room}</span>
                      <span className={`px-2 py-0.5 rounded-full ${duty.status === 'PUBLISHED' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {duty.status}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => navigate(`/exam-duties/${duty._id}`)}
                  className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors font-medium text-sm"
                >
                  <Eye size={16} /> Manage
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isImporting && (
        <ExamDutyImportWizard
          onCancel={() => setIsImporting(false)}
          onSuccess={(count) => {
            setIsImporting(false);
            fetchDuties();
            alert(`✅ Success! ${count} exam ${count === 1 ? 'duty' : 'duties'} created and assignments sent.`);
          }}
        />
      )}
      </div>
      )}
    </div>
  );
}

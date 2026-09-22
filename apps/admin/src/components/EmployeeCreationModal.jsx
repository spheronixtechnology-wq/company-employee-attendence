import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, Check, ChevronDown, ChevronLeft, Calendar, Lock, KeyRound, AlertCircle } from 'lucide-react';
import api from '../lib/api';

const CustomSelect = ({ value, onChange, options, placeholder, name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-slate-50 border ${isOpen ? 'border-violet-600 ring-4 ring-violet-600/10' : 'border-slate-200 hover:border-slate-300'} transition-all rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between cursor-pointer ${!value ? 'text-slate-400' : 'text-slate-800'}`}
      >
        {selectedOption ? selectedOption.label : placeholder}
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden animate-fade-in-up origin-top">
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
            {options.map((option, i) => (
              <div
                key={i}
                onClick={() => {
                  onChange({ target: { name, value: option.value } });
                  setIsOpen(false);
                }}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                  value === option.value 
                    ? 'bg-violet-50 text-violet-700' 
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option.label}
                {value === option.value && <Check size={16} strokeWidth={3} className="text-violet-600" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CompactSelect = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
      >
        <span className="text-sm font-bold text-slate-800">{selectedOption?.label}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden z-[60] min-w-[110px] animate-fade-in-up">
          <div className="max-h-48 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
            {options.map((option, i) => (
              <div
                key={i}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors text-center ${
                  value === option.value 
                    ? 'bg-violet-50 text-violet-700' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CustomDatePicker = ({ value, onChange, placeholder, name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  
  const formatDisplayDate = (val) => {
    if (!val) return '';
    const [year, month, day] = val.split('-');
    return `${day}-${month}-${year}`;
  };
  
  const [inputValue, setInputValue] = useState(formatDisplayDate(value));
  const ref = useRef(null);

  useEffect(() => {
    if (value) {
      setInputValue(formatDisplayDate(value));
      setCurrentMonth(new Date(value));
    } else {
      setInputValue('');
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const blanks = Array.from({ length: firstDayOfMonth });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleInputChange = (e) => {
    let val = e.target.value.replace(/[^\d]/g, '');
    
    // Smart masking for DD
    if (val.length >= 1) {
      if (parseInt(val[0], 10) > 3) {
        val = '0' + val;
      }
    }
    if (val.length >= 2) {
      let dd = parseInt(val.slice(0, 2), 10);
      if (dd === 0) val = '01' + val.slice(2);
      else if (dd > 31) val = '31' + val.slice(2);
    }
    
    // Smart masking for MM
    if (val.length >= 3) {
      if (parseInt(val[2], 10) > 1) {
        val = val.slice(0, 2) + '0' + val.slice(2);
      }
    }
    if (val.length >= 4) {
      let mm = parseInt(val.slice(2, 4), 10);
      if (mm === 0) val = val.slice(0, 2) + '01' + val.slice(4);
      else if (mm > 12) val = val.slice(0, 2) + '12' + val.slice(4);
    }

    let formattedVal = val;
    if (val.length > 2 && val.length <= 4) {
      formattedVal = val.slice(0, 2) + '-' + val.slice(2);
    } else if (val.length > 4) {
      formattedVal = val.slice(0, 2) + '-' + val.slice(2, 4) + '-' + val.slice(4, 8);
    }
    
    setInputValue(formattedVal);
    
    if (val.length === 8) {
      const d = val.slice(0, 2);
      const m = val.slice(2, 4);
      const y = val.slice(4, 8);
      const dateStr = `${y}-${m}-${d}`;
      const dateObj = new Date(dateStr);
      // Verify valid calendar day (e.g., no Feb 30th)
      if (!isNaN(dateObj.getTime()) && dateObj.getDate() === parseInt(d, 10)) {
         onChange({ target: { name, value: dateStr } });
         setCurrentMonth(new Date(y, parseInt(m)-1, 1));
      } else {
         onChange({ target: { name, value: '' } });
      }
    } else if (val === '') {
      onChange({ target: { name, value: '' } });
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div 
        className={`w-full bg-slate-50 border ${isOpen ? 'border-violet-600 ring-4 ring-violet-600/10' : 'border-slate-200 hover:border-slate-300'} transition-all rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between`}
      >
        <input 
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          maxLength="10"
          className="bg-transparent border-none outline-none w-full text-slate-800 placeholder:text-slate-400"
        />
        <Calendar onClick={() => setIsOpen(!isOpen)} size={16} className={`text-slate-400 hover:text-violet-600 cursor-pointer transition-colors ${isOpen ? 'text-violet-600' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 min-w-[300px] w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] overflow-hidden animate-fade-in-up origin-top p-4">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={18} /></button>
            <div className="flex items-center gap-0.5">
              <CompactSelect 
                value={currentMonth.getMonth()} 
                onChange={(val) => {
                  const newDate = new Date(currentMonth);
                  newDate.setMonth(parseInt(val));
                  setCurrentMonth(newDate);
                }}
                options={Array.from({length: 12}).map((_, i) => ({
                  value: i, 
                  label: new Date(2000, i, 1).toLocaleString('default', { month: 'short' })
                }))}
              />
              
              <CompactSelect 
                value={currentMonth.getFullYear()} 
                onChange={(val) => {
                  const newDate = new Date(currentMonth);
                  newDate.setFullYear(parseInt(val));
                  setCurrentMonth(newDate);
                }}
                options={Array.from({length: 100}).map((_, i) => {
                  const year = new Date().getFullYear() + 5 - i; // Starts from 5 years in future and goes backwards
                  return { value: year, label: year.toString() };
                })}
              />
            </div>
            <button type="button" onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ChevronRight size={18} /></button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-[10px] font-bold text-slate-400 uppercase">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((_, i) => <div key={`blank-${i}`} />)}
            {days.map(day => {
              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = value === dateStr;
              
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => {
                    onChange({ target: { name, value: dateStr } });
                    setIsOpen(false);
                  }}
                  className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-semibold transition-all ${
                    isSelected ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-700 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const EmployeeCreationModal = ({ onClose, onSuccess, teams = [] }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [officeLocations, setOfficeLocations] = useState([]);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await api.get('/admin/office-locations');
        setOfficeLocations(res.data?.data?.locations || []);
      } catch (err) {
        console.error("Failed to fetch office locations", err);
      }
    };
    fetchLocations();
  }, []);

  const [form, setForm] = useState({
    name: '', middleName: '', lastName: '', dob: '', gender: '',
    email: '', companyEmail: '', mobileNumber: '', currentAddress: '',
    emergencyContactName: '', emergencyContactNumber: '', emergencyContactRelation: '',
    department: '', designation: '', jobType: 'Full-Time', dateOfJoining: '',
    workLocation: '', country: '', officeBranch: '', teamShift: '',
    teamId: teams && teams.length > 0 ? (teams[0]._id || teams[0].id) : '', password: '', role: 'employee'
  });

  const handleChange = (e) => {
    let { name, value } = e.target;
    
    if (name === 'mobileNumber' || name === 'emergencyContactNumber') {
      value = value.replace(/\D/g, '').slice(0, 10);
    }
    
    setForm({ ...form, [name]: value });
  };

  const nextStep = () => {
    // Basic validation per step
    if (step === 1) {
      if (!form.name || !form.lastName || !form.dob || !form.gender) {
        return setError('First Name, Last Name, Date of Birth, and Gender are required.');
      }
    } else if (step === 2) {
      if (!form.email || !form.mobileNumber || !form.currentAddress || !form.emergencyContactName || !form.emergencyContactNumber || !form.emergencyContactRelation) {
        return setError('Please fill all required contact details.');
      }
      if (form.mobileNumber.length !== 10) {
        return setError('Mobile Number must be exactly 10 digits.');
      }
      if (form.emergencyContactNumber.length !== 10) {
        return setError('Emergency Contact Number must be exactly 10 digits.');
      }
    }
    setError(null);
    setStep(s => Math.min(s + 1, 3));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step !== 3) return;
    
    if (!form.department || !form.designation || !form.jobType || !form.dateOfJoining || !form.workLocation || !form.country || !form.officeBranch || !form.teamShift) {
      return setError('Please fill all required job information fields.');
    }
    if (!form.password || form.password.length < 6) {
      return setError('A temporary password of at least 6 characters is required.');
    }
    if (teams.length > 1 && !form.teamId) {
      return setError('Please select a team.');
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/admin/users', form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create team member.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Modal Container */}
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[2rem] w-full max-w-4xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-white/50 overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white/80 sticky top-0 z-10 backdrop-blur-lg">
          <div>
            <h2 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
              Create New Team Member
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">Add a new employee to your workspace</p>
          </div>
          <button onClick={onClose} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3 text-sm">
          {[
            { num: 1, label: 'Basic Info' },
            { num: 2, label: 'Contact Details' },
            { num: 3, label: 'Job Information' }
          ].map((s, i) => (
            <React.Fragment key={s.num}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                step === s.num ? 'bg-violet-100 text-violet-700 font-bold shadow-sm ring-1 ring-violet-200' : 
                step > s.num ? 'text-slate-600 font-semibold' : 'text-slate-400 font-medium'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  step === s.num ? 'bg-violet-600 text-white' : 
                  step > s.num ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {step > s.num ? <Check size={12} strokeWidth={3} /> : s.num}
                </span>
                {s.label}
              </div>
              {i < 2 && <div className={`w-8 h-[2px] rounded-full ${step > s.num ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>}
            </React.Fragment>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 custom-scrollbar p-8">
            {error && (
              <div className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-xl flex items-start gap-3">
                <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={18} />
                <div>
                  <h4 className="text-sm font-bold text-rose-800">Validation Error</h4>
                  <p className="text-sm text-rose-600 mt-1">{error}</p>
                </div>
              </div>
            )}
            
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-6 animate-fade-in-up">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center text-sm">1</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">First Name <span className="text-rose-500">*</span></label>
                    <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. John" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Middle Name</label>
                    <input type="text" name="middleName" value={form.middleName} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Last Name <span className="text-rose-500">*</span></label>
                    <input type="text" name="lastName" value={form.lastName} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. Doe" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Date of Birth <span className="text-rose-500">*</span></label>
                    <CustomDatePicker name="dob" value={form.dob} onChange={handleChange} placeholder="dd-mm-yyyy" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Gender <span className="text-rose-500">*</span></label>
                    <CustomSelect
                      name="gender"
                      value={form.gender}
                      onChange={handleChange}
                      placeholder="Select Gender"
                      options={[
                        { value: 'Male', label: 'Male' },
                        { value: 'Female', label: 'Female' },
                        { value: 'Other', label: 'Other' }
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Contact Details */}
            {step === 2 && (
              <div className="space-y-6 animate-fade-in-up">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center text-sm">2</span>
                  Contact Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Personal Email (Login) <span className="text-rose-500">*</span></label>
                    <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="john.doe@gmail.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Company Email</label>
                    <input type="email" name="companyEmail" value={form.companyEmail} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="john.doe@company.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number <span className="text-rose-500">*</span></label>
                    <input type="tel" maxLength="10" name="mobileNumber" value={form.mobileNumber} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="1234567890" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Current Address <span className="text-rose-500">*</span></label>
                    <textarea name="currentAddress" value={form.currentAddress} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400 resize-none" rows="2" placeholder="Full residential address" />
                  </div>
                  
                  <div className="md:col-span-2 pt-6 mt-2 border-t border-slate-100">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-lg text-amber-700 text-xs font-bold uppercase tracking-wider mb-4 border border-amber-200">
                      Emergency Contact
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Name <span className="text-rose-500">*</span></label>
                        <input type="text" name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} className="w-full bg-white border border-slate-200 focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-2.5 text-sm font-medium" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Number <span className="text-rose-500">*</span></label>
                        <input type="tel" maxLength="10" name="emergencyContactNumber" value={form.emergencyContactNumber} onChange={handleChange} className="w-full bg-white border border-slate-200 focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-2.5 text-sm font-medium" placeholder="1234567890" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Relation <span className="text-rose-500">*</span></label>
                        <input type="text" name="emergencyContactRelation" value={form.emergencyContactRelation} onChange={handleChange} className="w-full bg-white border border-slate-200 focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-2.5 text-sm font-medium" placeholder="e.g. Spouse" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Job Information */}
            {step === 3 && (
              <div className="space-y-6 animate-fade-in-up">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center text-sm">3</span>
                  Job Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Department <span className="text-rose-500">*</span></label>
                    <input type="text" name="department" value={form.department} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. Engineering" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Designation <span className="text-rose-500">*</span></label>
                    <input type="text" name="designation" value={form.designation} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. Frontend Dev" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Job Type <span className="text-rose-500">*</span></label>
                    <CustomSelect
                      name="jobType"
                      value={form.jobType}
                      onChange={handleChange}
                      placeholder="Select Job Type"
                      options={[
                        { value: 'Full-Time', label: 'Full-Time' },
                        { value: 'Part-Time', label: 'Part-Time' },
                        { value: 'Intern', label: 'Intern' },
                        { value: 'Contract', label: 'Contract' }
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Date of Joining <span className="text-rose-500">*</span></label>
                    <CustomDatePicker name="dateOfJoining" value={form.dateOfJoining} onChange={handleChange} placeholder="dd-mm-yyyy" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Work Location <span className="text-rose-500">*</span></label>
                    <input type="text" name="workLocation" value={form.workLocation} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. Remote" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Country <span className="text-rose-500">*</span></label>
                    <input type="text" name="country" value={form.country} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-violet-600/10 focus:border-violet-600 transition-all rounded-xl px-4 py-3 text-sm text-slate-800 font-medium placeholder:text-slate-400" placeholder="e.g. USA" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Office Branch <span className="text-rose-500">*</span></label>
                    <CustomSelect
                      name="officeBranch"
                      value={form.officeBranch}
                      onChange={handleChange}
                      placeholder="Select Office"
                      options={officeLocations.map(loc => ({
                        value: loc.officeName,
                        label: loc.officeName
                      }))}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Team Shift <span className="text-rose-500">*</span></label>
                    <CustomSelect
                      name="teamShift"
                      value={form.teamShift}
                      onChange={handleChange}
                      placeholder="Select Shift"
                      options={[
                        { value: 'Morning (9 AM - 5 PM)', label: 'Morning (9 AM - 5 PM)' },
                        { value: 'Evening (5 PM - 1 AM)', label: 'Evening (5 PM - 1 AM)' },
                        { value: 'Night (1 AM - 9 AM)', label: 'Night (1 AM - 9 AM)' },
                        { value: 'Flexible', label: 'Flexible' }
                      ]}
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Role <span className="text-rose-500">*</span></label>
                    <CustomSelect
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      placeholder="Select Role"
                      options={[
                        { value: 'employee', label: 'Employee' },
                        { value: 'manager', label: 'Manager' },
                        { value: 'admin', label: 'Admin' }
                      ]}
                    />
                  </div>
                  
                  {teams.length > 1 && (
                    <div className="lg:col-span-3">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Assign to Team <span className="text-rose-500">*</span></label>
                      <CustomSelect
                        name="teamId"
                        value={form.teamId}
                        onChange={handleChange}
                        placeholder="Select Team"
                        options={teams ? teams.map(t => ({ value: t._id || t.id, label: t.name })) : []}
                      />
                    </div>
                  )}
                  
                  <div className="lg:col-span-3 mt-4 pt-6 border-t border-slate-100">
                    <div className="bg-white border border-rose-100 rounded-2xl p-6 relative overflow-hidden shadow-sm group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                      <div className="relative z-10">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                          <Lock size={14} className="text-rose-400" />
                          Temporary Password <span className="text-rose-500">*</span>
                        </label>
                        
                        <div className="relative group/input">
                          <input 
                            type="text" 
                            name="password" 
                            value={form.password} 
                            onChange={handleChange} 
                            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all duration-300 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-800 font-mono placeholder:text-slate-400" 
                            placeholder="Set a secure temporary password" 
                          />
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 group-focus-within/input:text-rose-500 text-slate-400">
                            <KeyRound size={16} />
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3 mt-4 bg-rose-50/50 rounded-xl p-3.5 border border-rose-100/50">
                          <div className="bg-rose-100 p-1 rounded-lg text-rose-600 shrink-0 mt-0.5">
                            <AlertCircle size={14} strokeWidth={2.5} />
                          </div>
                          <p className="text-xs text-slate-600 font-medium leading-relaxed">
                            For security purposes, the user will be <strong className="text-slate-800 font-bold">strictly forced</strong> to change this password immediately upon their first successful login.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Actions */}
          <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0">
            <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <div className="flex gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="px-6 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:shadow rounded-xl transition-all"
                  >
                    Previous
                  </button>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="px-8 py-3 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-600/25 rounded-xl transition-all hover:-translate-y-0.5 flex items-center gap-2"
                  >
                    Continue <ChevronRight size={16} strokeWidth={3} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-8 py-3 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 rounded-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
                  >
                    {loading ? 'Creating...' : <><Check size={18} strokeWidth={3} /> Complete Setup</>}
                  </button>
                )}
              </div>
            </div>
          </form>
      </div>
    </div>
  );
};

export default EmployeeCreationModal;

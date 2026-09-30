import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, Upload, Download, CheckCircle2, AlertTriangle, AlertCircle,
  FileSpreadsheet, Users, ChevronRight, Loader2, RefreshCw
} from 'lucide-react';
import api from '../lib/api';

const STEPS = [
  { num: 1, label: 'Upload File',  icon: Upload },
  { num: 2, label: 'Validating',   icon: Loader2 },
  { num: 3, label: 'Preview',      icon: FileSpreadsheet },
  { num: 4, label: 'Confirm',      icon: CheckCircle2 },
];

const StatusBadge = ({ status }) => {
  if (status === 'VALID')    return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">✓ Valid</span>;
  if (status === 'ERROR')    return <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">✗ Error</span>;
  if (status === 'CONFLICT') return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">⚠ Conflict</span>;
  return null;
};

/**
 * Authenticated file download — uses axios (sends auth cookie) then triggers browser save.
 */
const downloadAuthFile = async (apiPath, fileName) => {
  const res = await api.get(apiPath, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const generateTemplateClientSide = () => {
  // These MUST match REQUIRED_HEADERS in ExamDutyImportService.js exactly (case-insensitive)
  const headers = [
    'Exam Name',
    'Exam Type',
    'Subject',
    'Subject Code',
    'Course',
    'Semester',
    'Exam Date',
    'Session',
    'Reporting Time',
    'Start Time',
    'End Time',
    'Campus',
    'Building',
    'Room',
    'Duty Type',
    'Assigned Staff Email',
    'Instructions',
    'Matter',
  ];

  // Row 2: format hints (shown in grey in Excel)
  const hintsRow = [
    'e.g. End Semester Exam',
    'End Semester / Mid Semester / Internal Assessment / Practical',
    'e.g. Mathematics',
    'e.g. MA101',
    'e.g. B.Tech CSE',
    'e.g. 5',
    'DD/MM/YYYY — e.g. 15/11/2026',
    'Morning / Afternoon / Full Day',
    'HH:MM — e.g. 09:00',
    'HH:MM — e.g. 10:00',
    'HH:MM — e.g. 13:00',
    'e.g. Main Campus',
    'e.g. Block A',
    'e.g. Room 101',
    'Invigilator / Chief Superintendent / Deputy Superintendent / Reliever / Examination Squad / Support Staff',
    'faculty@college.edu (must match system email)',
    'Optional instructions',
    'Optional matter/notes',
  ];

  // Row 3: sample data
  const sampleRow = [
    'End Semester Examination',
    'End Semester',
    'Mathematics',
    'MA101',
    'B.Tech CSE',
    '5',
    '15/11/2026',
    'Morning',
    '09:00',
    '10:00',
    '13:00',
    'Main Campus',
    'Block A',
    'Room 101',
    'Invigilator',
    'faculty@college.edu',
    'Bring question papers by 9:30 AM',
    '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, hintsRow, sampleRow]);

  // Column widths auto-sized
  ws['!cols'] = headers.map(() => ({ wch: 28 }));
  // Make last col (Duty Type) wider
  ws['!cols'][14] = { wch: 55 };
  ws['!cols'][16] = { wch: 35 };

  ws['!rows'] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Exam Duty Template');

  // Reference sheet — valid values
  const refHeaders = ['Field', 'Valid Values', 'Required?'];
  const refData = [
    ['Exam Name',           'Any text',                                                                          'Yes'],
    ['Exam Type',           'End Semester, Mid Semester, Internal Assessment, Practical',                       'Yes'],
    ['Subject',             'Any text',                                                                          'Yes'],
    ['Subject Code',        'Any text',                                                                          'Yes'],
    ['Course',              'Any text',                                                                          'Yes'],
    ['Semester',            'Any number or text',                                                                'Yes'],
    ['Exam Date',           'DD/MM/YYYY format — e.g. 15/11/2026',                                             'Yes'],
    ['Session',             'Morning, Afternoon, Full Day',                                                     'Yes'],
    ['Reporting Time',      'HH:MM 24-hour format — e.g. 09:00',                                               'Yes'],
    ['Start Time',          'HH:MM 24-hour format — e.g. 10:00',                                               'Yes'],
    ['End Time',            'HH:MM 24-hour format — e.g. 13:00 (must be after Start Time)',                    'Yes'],
    ['Campus',              'Any text',                                                                          'Yes'],
    ['Building',            'Any text',                                                                          'Yes'],
    ['Room',                'Any text',                                                                          'Yes'],
    ['Duty Type',           'Invigilator, Chief Superintendent, Deputy Superintendent, Reliever, Examination Squad, Support Staff', 'Yes'],
    ['Assigned Staff Email','Must match an active Faculty or HOD email in the system',                         'Yes'],
    ['Instructions',        'Any text',                                                                          'No'],
    ['Matter',              'Any text',                                                                          'No'],
  ];
  const refWs = XLSX.utils.aoa_to_sheet([refHeaders, ...refData]);
  refWs['!cols'] = [{ wch: 22 }, { wch: 75 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, refWs, 'Field Reference');

  XLSX.writeFile(wb, 'exam-duty-template.xlsx');
};

export default function ExamDutyImportWizard({ onCancel, onSuccess }) {
  const [step, setStep]               = useState(1);
  const [file, setFile]               = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const [validating, setValidating]   = useState(false);
  const [preview, setPreview]         = useState(null);  // { importId, totalRows, validRows, ... }
  const [confirming, setConfirming]   = useState(false);
  const [error, setError]             = useState('');

  // ── File selection helpers ────────────────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return;
    if (!['.xlsx', '.xls'].includes('.' + f.name.split('.').pop().toLowerCase())) {
      setError('Only .xlsx and .xls files are accepted.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File exceeds 5MB limit.');
      return;
    }
    setError('');
    setFile(f);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  // ── Step 1 → 2/3: Upload & validate ──────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;
    setValidating(true);
    setStep(2);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/exam-duties/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPreview(res.data.data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Validation failed. Please check the file and try again.');
      setStep(1);
    } finally {
      setValidating(false);
    }
  };

  // ── Step 4: Confirm ───────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const res = await api.post('/exam-duties/import/confirm', { importId: preview.importId });
      onSuccess(res.data.data.dutiesCreated);
    } catch (err) {
      setError(err.response?.data?.message || 'Confirmation failed. Please try again.');
      setConfirming(false);
    }
  };

  const handleDownloadErrors = () => {
    downloadAuthFile(`/exam-duties/import/${preview.importId}/errors`, `errors_report.xlsx`);
  };

  const handleReset = () => {
    setStep(1); setFile(null); setPreview(null); setError('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-primary-600" size={22} />
            <h2 className="text-xl font-bold text-slate-900">Import Exam Duties from Excel</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-200">
            <X size={22} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s.num ? 'bg-primary-600 text-white' :
                step > s.num  ? 'bg-emerald-500 text-white' :
                                'bg-slate-200 text-slate-500'
              }`}>
                {step > s.num ? <CheckCircle2 size={14} /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${step >= s.num ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Download buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => generateTemplateClientSide()}
                  className="flex items-center gap-3 p-4 bg-white border-2 border-dashed border-primary-200 hover:border-primary-400 rounded-xl transition-colors group text-left"
                >
                  <div className="p-2 bg-primary-50 text-primary-600 rounded-lg group-hover:bg-primary-100">
                    <Download size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">Download Template</p>
                    <p className="text-xs text-slate-500">Blank .xlsx with sample row</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => downloadAuthFile('/exam-duties/faculty-list', 'faculty-hod-list.xlsx')}
                  className="flex items-center gap-3 p-4 bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-400 rounded-xl transition-colors group text-left"
                >
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">Download Staff List</p>
                    <p className="text-xs text-slate-500">Faculty & HOD emails</p>
                  </div>
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                  dragOver ? 'border-primary-400 bg-primary-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
                onClick={() => document.getElementById('excel-file-input').click()}
              >
                <input
                  id="excel-file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {file ? (
                  <>
                    <FileSpreadsheet size={40} className="mx-auto mb-3 text-emerald-500" />
                    <p className="font-bold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB — ready to upload</p>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="mt-3 text-xs text-rose-500 hover:underline">Remove</button>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="mx-auto mb-3 text-slate-400" />
                    <p className="font-semibold text-slate-700">Drop your .xlsx file here</p>
                    <p className="text-sm text-slate-400 mt-1">or click to browse</p>
                    <p className="text-xs text-slate-400 mt-2">Max 500 rows · .xlsx only · 5MB limit</p>
                  </>
                )}
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-sm">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Validating */}
          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 size={48} className="text-primary-500 animate-spin mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-1">Validating your file...</h3>
              <p className="text-slate-500">Checking rows, resolving staff emails, detecting conflicts</p>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 3 && preview && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-slate-900">{preview.totalRows}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Total Rows</p>
                </div>
                <div className={`${preview.validRows === preview.totalRows ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 text-center`}>
                  <p className="text-3xl font-black text-emerald-700">{preview.validRows}</p>
                  <p className="text-sm text-emerald-600 mt-0.5">Valid</p>
                </div>
                <div className={`${preview.invalidRows > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-100 border-slate-200'} border rounded-xl p-4 text-center`}>
                  <p className={`text-3xl font-black ${preview.invalidRows > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{preview.invalidRows}</p>
                  <p className={`text-sm mt-0.5 ${preview.invalidRows > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Errors / Conflicts</p>
                </div>
              </div>

              {/* Row preview table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm relative">
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                      <tr>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Row</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Exam Details</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Subject & Course</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Schedule</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Location</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Assigned Staff</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50">Status</th>
                        <th className="p-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50 min-w-[200px]">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.validationResults.map((row) => (
                        <tr key={row.excelRowNumber} className={
                          row.status === 'ERROR'    ? 'bg-rose-50/40' :
                          row.status === 'CONFLICT' ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'
                        }>
                          <td className="p-3 font-mono text-slate-500">{row.excelRowNumber}</td>
                          <td className="p-3">
                            <p className="font-medium text-slate-900">{row.examName || '—'}</p>
                            <p className="text-xs text-slate-500">{row.examType || '—'}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-slate-900">{row.subject || '—'} <span className="text-slate-400">({row.subjectCode || '—'})</span></p>
                            <p className="text-xs text-slate-500">{row.course || '—'} - Sem {row.semester || '—'}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-slate-900">{row.date || '—'} <span className="text-slate-400">({row.session || '—'})</span></p>
                            <p className="text-xs text-slate-500">{row.startTime || '—'} to {row.endTime || '—'} (Report: {row.reportingTime || '—'})</p>

                          </td>
                          <td className="p-3">
                            <p className="text-slate-900">{row.room || '—'}</p>
                            <p className="text-xs text-slate-500">{row.building || '—'}, {row.campus || '—'}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-slate-900">{row.staffName || row.staffEmail || '—'}</p>
                            <p className="text-xs text-slate-500">{row.dutyType || '—'}</p>
                          </td>
                          <td className="p-3"><StatusBadge status={row.status} /></td>
                          <td className="p-3 text-xs text-rose-700 max-w-[250px] whitespace-normal leading-relaxed">
                            {row.errors?.join('; ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Error policy banner */}
              {preview.invalidRows > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 text-amber-800 text-sm">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{preview.invalidRows} row{preview.invalidRows > 1 ? 's' : ''} need to be fixed.</p>
                      <p className="text-amber-700 text-xs mt-0.5">All rows must be valid before you can confirm. Fix the errors and re-upload.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={handleDownloadErrors} className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-50 flex items-center gap-1">
                      <Download size={14} /> Error Report
                    </button>
                    <button onClick={handleReset} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center gap-1">
                      <RefreshCw size={14} /> Re-upload
                    </button>
                  </div>
                </div>
              )}

              {preview.allValid && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
                  <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-semibold">All {preview.totalRows} rows are valid!</p>
                    <p className="text-sm text-emerald-700">Click "Confirm Import" to create {preview.totalRows} exam {preview.totalRows === 1 ? 'duty' : 'duties'} and send assignments.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Confirming spinner */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 size={48} className="text-emerald-500 animate-spin mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-1">Creating exam duties...</h3>
              <p className="text-slate-500">All duties are being created and notifications are being sent.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
          {error && (
            <div className="text-rose-600 text-sm flex items-center gap-1.5">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {!error && <div />}

          <div className="flex gap-3">
            <button
              onClick={step === 3 ? handleReset : onCancel}
              disabled={validating || confirming}
              className="px-5 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50"
            >
              {step === 3 && preview?.invalidRows === 0 ? 'Cancel' : step === 3 ? 'Re-upload' : 'Cancel'}
            </button>

            {step === 1 && (
              <button
                onClick={handleUpload}
                disabled={!file || validating}
                className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Upload size={16} /> Validate File
              </button>
            )}

            {step === 3 && preview?.allValid && (
              <button
                onClick={async () => { setStep(4); await handleConfirm(); }}
                disabled={confirming}
                className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-emerald-600/20"
              >
                <CheckCircle2 size={16} /> Confirm Import
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

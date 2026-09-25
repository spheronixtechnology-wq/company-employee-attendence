import { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  File,
  Loader2,
  AlertCircle,
  Table,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

// Helper to convert Base64 string to ArrayBuffer for Mammoth & binary parsers
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  documentUrl,
  documentName = 'Document',
  documentSize,
}) {
  // ── 1. All React Hooks unconditionally declared at top ──────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Excel state
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [sheetData, setSheetData] = useState([]);

  // Word state (.docx HTML preview)
  const [wordHtml, setWordHtml] = useState('');

  // Text state
  const [textContent, setTextContent] = useState('');

  const ext = ((documentName || documentUrl || '').split('.').pop() || '').toLowerCase();
  const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
  const isPdf = ext === 'pdf';
  const isWord = ['docx', 'doc'].includes(ext);
  const isText = ['txt', 'log', 'json', 'md'].includes(ext);

  useEffect(() => {
    // Only execute parser when modal is open and URL is present
    if (!isOpen || !documentUrl) {
      setWorkbook(null);
      setSheetNames([]);
      setActiveSheet('');
      setSheetData([]);
      setWordHtml('');
      setTextContent('');
      setError(null);
      return;
    }

    setError(null);
    setLoading(true);

    const isBase64 = typeof documentUrl === 'string' && documentUrl.startsWith('data:');
    const rawBase64 = isBase64 ? documentUrl.split(',')[1] : null;

    if (isExcel) {
      try {
        if (isBase64 && rawBase64) {
          const wb = XLSX.read(rawBase64, { type: 'base64' });
          setWorkbook(wb);
          setSheetNames(wb.SheetNames || []);
          if (wb.SheetNames && wb.SheetNames.length > 0) {
            const firstSheet = wb.SheetNames[0];
            setActiveSheet(firstSheet);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
              header: 1,
              defval: '',
              blankrows: false,
            });
            setSheetData(data);
          }
          setLoading(false);
        } else {
          // Standard HTTP URL fallback
          fetch(documentUrl)
            .then((res) => {
              if (!res.ok) throw new Error(`Failed to load spreadsheet (${res.status})`);
              return res.arrayBuffer();
            })
            .then((buffer) => {
              const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
              setWorkbook(wb);
              setSheetNames(wb.SheetNames || []);
              if (wb.SheetNames && wb.SheetNames.length > 0) {
                const firstSheet = wb.SheetNames[0];
                setActiveSheet(firstSheet);
                const data = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
                  header: 1,
                  defval: '',
                  blankrows: false,
                });
                setSheetData(data);
              }
              setLoading(false);
            })
            .catch((err) => {
              setError(err.message || 'Could not parse spreadsheet preview.');
              setLoading(false);
            });
        }
      } catch (err) {
        console.error('Excel parse error:', err);
        setError(err.message || 'Could not parse spreadsheet preview.');
        setLoading(false);
      }
    } else if (isWord) {
      // Word document preview using mammoth
      try {
        const getBufferPromise = isBase64 && rawBase64
          ? Promise.resolve(base64ToArrayBuffer(rawBase64))
          : fetch(documentUrl).then((r) => r.arrayBuffer());

        getBufferPromise
          .then((arrayBuffer) => mammoth.convertToHtml({ arrayBuffer }))
          .then((result) => {
            setWordHtml(result.value || '<p>Document is empty.</p>');
            setLoading(false);
          })
          .catch((err) => {
            console.error('Word parse error:', err);
            // Non-fatal: if mammoth fails on binary doc, show fallback card with download
            setError('In-browser Word formatting could not be converted. Please use the Download button below.');
            setLoading(false);
          });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    } else if (isText) {
      try {
        if (isBase64 && rawBase64) {
          const decoded = window.atob(rawBase64);
          setTextContent(decoded);
          setLoading(false);
        } else {
          fetch(documentUrl)
            .then((r) => r.text())
            .then((text) => {
              setTextContent(text);
              setLoading(false);
            })
            .catch((err) => {
              setError(err.message || 'Could not load text preview.');
              setLoading(false);
            });
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    } else {
      // PDF or other documents
      setLoading(false);
    }
  }, [isOpen, documentUrl, isExcel, isPdf, isWord, isText]);

  const handleSheetChange = (name) => {
    if (!workbook || !workbook.Sheets[name]) return;
    setActiveSheet(name);
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: '',
      blankrows: false,
    });
    setSheetData(data);
  };

  const handleDownload = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = documentUrl;
    link.download = documentName || `document.${ext || 'dat'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ── 2. Guard return AFTER all hooks have executed ────────────────────────────
  if (!isOpen || !documentUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Top Decorative Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 shrink-0" />

        {/* ── Sticky Header with Generous Spacing ── */}
        <div className="px-7 sm:px-8 pt-6 pb-5 border-b border-slate-100/90 bg-white/90 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-md ${
                isExcel
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-emerald-500/10'
                  : isPdf
                  ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-rose-500/10'
                  : isWord
                  ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-blue-500/10'
                  : 'bg-violet-50 border-violet-200 text-violet-600 shadow-violet-500/10'
              }`}
            >
              {isExcel ? (
                <FileSpreadsheet size={22} />
              ) : isPdf ? (
                <FileText size={22} />
              ) : isText ? (
                <FileCode size={22} />
              ) : (
                <File size={22} />
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate" title={documentName}>
                {documentName}
              </h2>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-slate-500">
                <span className="uppercase font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-200/60 text-[10px]">
                  {ext} file
                </span>
                {documentSize && (
                  <span className="font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md text-[11px]">
                    {formatSize(documentSize)}
                  </span>
                )}
                {isExcel && sheetNames.length > 0 && (
                  <span className="font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md text-[11px]">
                    {sheetNames.length} sheet{sheetNames.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            {/* Explicit Download Button */}
            <button
              id="preview-modal-download-btn"
              onClick={handleDownload}
              className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download original file"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Circular Close Button */}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer flex items-center justify-center border border-slate-200/60 shadow-2xs hover:scale-105 active:scale-95"
              title="Close Preview"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Sheet Tab Switcher for Excel */}
        {isExcel && sheetNames.length > 1 && (
          <div className="flex items-center gap-1 px-5 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto text-xs shrink-0">
            <span className="text-[11px] text-slate-600 mr-2 flex items-center gap-1">
              <Table size={12} /> Sheets:
            </span>
            {sheetNames.map((name) => (
              <button
                key={name}
                onClick={() => handleSheetChange(name)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activeSheet === name
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Modal Body Preview Area */}
        <div className="p-4 md:p-6 flex-1 min-h-0 bg-slate-50 flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-slate-600">
              <Loader2 size={32} className="animate-spin text-primary-600" />
              <p className="text-sm">Loading document preview…</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-danger-500/15 border border-danger-500/30 text-danger-400 flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Preview Information</p>
                <p className="text-xs text-slate-600 mt-1 max-w-md">{error}</p>
              </div>
              <button onClick={handleDownload} className="btn-primary text-xs py-2 px-4 mt-2 flex items-center gap-2">
                <Download size={14} /> Download Document
              </button>
            </div>
          ) : isExcel ? (
            /* Excel Spreadsheet Grid View */
            <div className="flex-1 min-h-0 overflow-auto space-y-2">
              {sheetData.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-slate-500 text-sm">
                  This sheet is empty.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="p-2.5 px-3 w-12 text-center text-[10px] text-slate-500 border-r border-slate-200 select-none bg-slate-100">
                          #
                        </th>
                        {sheetData[0]?.map((_, colIdx) => (
                          <th
                            key={colIdx}
                            className="p-2.5 px-3.5 text-slate-700 font-semibold border-r border-slate-200 last:border-0 whitespace-nowrap"
                          >
                            {String.fromCharCode(65 + (colIdx % 26))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sheetData.slice(0, 100).map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="hover:bg-slate-50 transition-colors odd:bg-slate-50/50"
                        >
                          <td className="p-2 px-3 text-center text-[10px] text-slate-500 border-r border-slate-200 bg-slate-100/50 select-none">
                            {rowIdx + 1}
                          </td>
                          {sheetData[0]?.map((_, colIdx) => (
                            <td
                              key={colIdx}
                              className="p-2 px-3.5 text-slate-800 border-r border-slate-200 last:border-0 whitespace-pre-wrap max-w-xs break-words"
                            >
                              {row[colIdx] !== undefined && row[colIdx] !== null
                                ? String(row[colIdx])
                                : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheetData.length > 100 && (
                    <div className="p-2.5 text-center text-xs text-slate-600 bg-slate-50 border-t border-slate-200">
                      Showing first 100 of {sheetData.length} rows. Click Download above to inspect complete workbook.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isWord && wordHtml ? (
            /* Word Document HTML Preview */
            <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white p-6 md:p-8 text-slate-900 text-sm overflow-y-auto shadow-sm leading-relaxed prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: wordHtml }} />
            </div>
          ) : isPdf ? (
            /* PDF Embedded Preview */
            <div className="w-full flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col" style={{ height: '100%' }}>
              <iframe
                src={`${documentUrl}#toolbar=1`}
                title={documentName}
                className="w-full flex-1 border-0 rounded-xl bg-white"
                style={{ width: '100%', height: '100%', minHeight: '100%' }}
              />
            </div>
          ) : isText ? (
            /* Text File Viewer */
            <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed overflow-auto shadow-sm">
              {textContent}
            </div>
          ) : (
            /* Fallback generic document preview */
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 text-violet-600 flex items-center justify-center shadow-sm">
                <FileText size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-900">{documentName}</p>
                <p className="text-xs text-slate-600">
                  {documentSize ? formatSize(documentSize) + ' • ' : ''}{ext.toUpperCase()} Document
                </p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Click below to download this document and open it in your local desktop application.
                </p>
              </div>
              <button
                onClick={handleDownload}
                className="btn-primary text-xs py-2.5 px-5 flex items-center gap-2 font-semibold shadow-sm"
              >
                <Download size={15} /> Download Document
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 px-5 border-t border-slate-200 bg-white flex items-center justify-end gap-3 text-xs text-slate-600 shrink-0">
          <button
            onClick={handleDownload}
            className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 font-semibold shadow-sm"
          >
            <Download size={14} /> Download
          </button>
          <button
            onClick={onClose}
            className="btn bg-white text-xs py-1.5 px-3.5 border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ExamDutyImportService
 * Full validation pipeline: parse → file → header → row → cross-row → DB conflicts.
 * Returns structured RowResult[] used to populate ExamDutyImport.validationResults.
 */
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const User = require('../models/User');
const { findConflicts } = require('./ExamDutyConflictService');

const MAX_IMPORT_ROWS = parseInt(process.env.MAX_IMPORT_ROWS || '500', 10);

const VALID_SESSIONS   = ['Morning', 'Afternoon', 'Full Day'];
const VALID_EXAM_TYPES = ['End Semester', 'Mid Semester', 'Internal Assessment', 'Practical'];
const VALID_DUTY_TYPES = ['Invigilator', 'Chief Superintendent', 'Deputy Superintendent', 'Reliever', 'Examination Squad', 'Support Staff'];

// Required column headers (case-insensitive, trimmed match)
const REQUIRED_HEADERS = [
  'Exam Name', 'Exam Type', 'Subject', 'Subject Code', 'Course', 'Semester',
  'Exam Date', 'Session', 'Reporting Time', 'Start Time', 'End Time',
  'Campus', 'Building', 'Room', 'Duty Type', 'Assigned Staff Email'
];

// ─── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a Buffer.
 */
const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * Parse a cell value to a plain string, trimmed.
 */
const cellStr = (cell) => {
  if (cell == null) return '';
  const val = cell.value ?? cell;
  if (val == null) return '';
  
  // Handle ExcelJS richText and hyperlink objects
  if (val && typeof val === 'object') {
    if (val.richText) return val.richText.map(rt => rt.text).join('').trim();
    if (val.text) return String(val.text).trim(); // for hyperlinks
  }
  
  return String(val).trim();
};

/**
 * Parse a time string like "09:30" or a Date into "HH:MM".
 * Returns null if invalid.
 */
const parseTime = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) {
    const h = String(raw.getUTCHours()).padStart(2, '0');
    const m = String(raw.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(raw).trim();
  if (/^\d{1,2}:\d{2}$/.test(str)) return str.padStart(5, '0');
  return null;
};

/**
 * Parse a date value from Excel (Date object or string) into a JS Date.
 * Returns null if invalid.
 */
const parseDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw) ? null : raw;
  const str = String(raw).trim();
  // Try DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`);
    return isNaN(d) ? null : d;
  }
  // Try ISO
  const d = new Date(str);
  return isNaN(d) ? null : d;
};

/**
 * Build a full ISO datetime string from a Date (date part) and HH:MM string (time part).
 */
const buildDateTime = (datePart, timeStr) => {
  const dateStr = datePart.toISOString().split('T')[0];
  return new Date(`${dateStr}T${timeStr}:00.000Z`).toISOString();
};

/**
 * Check if two time windows overlap.
 */
const timesOverlap = (start1, end1, start2, end2) => {
  return new Date(start1) < new Date(end2) && new Date(end1) > new Date(start2);
};

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parse and fully validate an uploaded Excel buffer.
 *
 * @param {Buffer} buffer          - Raw Excel file buffer
 * @param {string} fileName        - Original filename (for error messages)
 * @returns {Promise<ValidationResult>}
 */
const validateExcelBuffer = async (buffer, fileName) => {
  const fileHash = hashBuffer(buffer);

  // ── STEP 1: File-level parsing ─────────────────────────────────────────────
  let workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
  } catch {
    return { fileError: 'The uploaded file is corrupted or is not a valid .xlsx file.' };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { fileError: 'The workbook contains no worksheets.' };
  }

  // ── STEP 2: Worksheet validation ───────────────────────────────────────────
  const rowCount = worksheet.rowCount;
  if (rowCount < 2) {
    return { fileError: 'The worksheet has no data rows (header row only).' };
  }
  if (rowCount - 1 > MAX_IMPORT_ROWS) {
    return { fileError: `Too many rows. Maximum allowed is ${MAX_IMPORT_ROWS}. Found ${rowCount - 1}.` };
  }

  // ── STEP 3: Header validation ──────────────────────────────────────────────
  const headerRow = worksheet.getRow(1);
  const headerMap = {}; // normalised label → column index (1-based)
  headerRow.eachCell((cell, colIndex) => {
    // Strip trailing asterisks and format hints like "(DD/MM/YYYY)"
    const rawLabel = cellStr(cell);
    const label = rawLabel
      .replace(/\s*\([^)]*\)/g, '') // remove anything in parentheses
      .replace(/\*/g, '')           // remove asterisks
      .trim()
      .toLowerCase();
    
    if (label) headerMap[label] = colIndex;
  });


  const missingHeaders = REQUIRED_HEADERS.filter(h => !headerMap[h.toLowerCase()]);
  if (missingHeaders.length > 0) {
    return { fileError: `Missing required column(s): ${missingHeaders.join(', ')}` };
  }

  // Helper to read a cell from a row by header label
  const col = (row, label) => cellStr(row.getCell(headerMap[label.toLowerCase()]));

  // ── STEP 4: Row-by-row validation ──────────────────────────────────────────
  const rawRows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // always skip header

    let isEmpty = true;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cellStr(cell)) isEmpty = false;
    });
    if (isEmpty) return; // skip rows that are completely blank or just contain formatting

    const examName     = col(row, 'Exam Name');
    
    // Dynamically skip the hints row if the user left it in (instead of hardcoding row 2)
    if (examName === 'e.g. End Semester Exam') return;

    // Helper for case-insensitive and alias mapping
    const mapDropdown = (val, validArray) => {
      if (!val) return val;
      const lower = val.toLowerCase().trim();
      
      // Exact case-insensitive match
      const exact = validArray.find(v => v.toLowerCase() === lower);
      if (exact) return exact;
      
      // Handle aliases users might type instead
      if (lower.includes('mid') && lower.includes('exam')) return 'Mid Semester';
      if (lower.includes('end') && lower.includes('exam')) return 'End Semester';
      if (lower.includes('full') && lower.includes('day')) return 'Full Day';
      if (lower === 'chief' || lower === 'chief supt') return 'Chief Superintendent';
      if (lower === 'deputy' || lower === 'deputy supt') return 'Deputy Superintendent';
      
      return val;
    };

    const examType     = mapDropdown(col(row, 'Exam Type'), VALID_EXAM_TYPES);
    const subject      = col(row, 'Subject');
    const subjectCode  = col(row, 'Subject Code');
    const course       = col(row, 'Course');
    const semester     = col(row, 'Semester');
    const rawDate      = row.getCell(headerMap['exam date']).value;
    const session      = mapDropdown(col(row, 'Session'), VALID_SESSIONS);
    const rawReporting = row.getCell(headerMap['reporting time']).value;
    const rawStart     = row.getCell(headerMap['start time']).value;
    const rawEnd       = row.getCell(headerMap['end time']).value;
    const campus       = col(row, 'Campus');
    const building     = col(row, 'Building');
    const room         = col(row, 'Room');
    const dutyType     = mapDropdown(col(row, 'Duty Type'), VALID_DUTY_TYPES);
    const staffEmail   = col(row, 'Assigned Staff Email').toLowerCase();
    const instructions = col(row, 'Instructions');
    const matter       = col(row, 'Matter');

    const errors = [];

    if (!examName)    errors.push('Exam Name is required');
    if (!subject)     errors.push('Subject is required');
    if (!subjectCode) errors.push('Subject Code is required');
    if (!course)      errors.push('Course is required');
    if (!semester)    errors.push('Semester is required');
    if (!campus)      errors.push('Campus is required');
    if (!building)    errors.push('Building is required');
    if (!room)        errors.push('Room is required');
    if (!staffEmail)  errors.push('Assigned Staff Email is required');

    if (examType && !VALID_EXAM_TYPES.includes(examType))
      errors.push(`Invalid Exam Type "${examType}". Must be one of: ${VALID_EXAM_TYPES.join(', ')}`);

    if (session && !VALID_SESSIONS.includes(session))
      errors.push(`Invalid Session "${session}". Must be one of: ${VALID_SESSIONS.join(', ')}`);

    if (dutyType && !VALID_DUTY_TYPES.includes(dutyType))
      errors.push(`Invalid Duty Type "${dutyType}". Must be one of: ${VALID_DUTY_TYPES.join(', ')}`);

    const parsedDate  = parseDate(rawDate);
    const parsedStart = parseTime(rawStart);
    const parsedEnd   = parseTime(rawEnd);
    const parsedRep   = parseTime(rawReporting);

    if (!parsedDate) errors.push('Exam Date is invalid (use DD/MM/YYYY)');
    if (!parsedStart) errors.push('Start Time is invalid (use HH:MM)');
    if (!parsedEnd)   errors.push('End Time is invalid (use HH:MM)');

    if (parsedDate && parsedStart && parsedEnd) {
      const startDt = new Date(`${parsedDate.toISOString().split('T')[0]}T${parsedStart}:00Z`);
      const endDt   = new Date(`${parsedDate.toISOString().split('T')[0]}T${parsedEnd}:00Z`);
      if (endDt <= startDt) errors.push('End Time must be after Start Time');
    }

    rawRows.push({
      excelRowNumber: rowNumber,
      examName, examType, subject, subjectCode, course, semester,
      parsedDate, session, parsedStart, parsedEnd, parsedRep,
      campus, building, room, dutyType, staffEmail,
      instructions, matter,
      errors,
      status: errors.length > 0 ? 'ERROR' : 'VALID'
    });
  });

  // ── STEP 5: Faculty/staff resolution (DB lookup for valid rows only) ────────
  const validRows = rawRows.filter(r => r.status === 'VALID');
  const uniqueEmails = [...new Set(validRows.map(r => r.staffEmail))];

  const resolvedUsers = await User.find({
    email: { $in: uniqueEmails },
  }).select('_id name email role isActive').lean();

  const userByEmail = {};
  for (const u of resolvedUsers) userByEmail[u.email.toLowerCase()] = u;

  for (const row of validRows) {
    const user = userByEmail[row.staffEmail];
    if (!user) {
      row.errors.push(`No user found with email "${row.staffEmail}"`);
      row.status = 'ERROR';
      continue;
    }
    if (!user.isActive) {
      row.errors.push(`"${user.name}" account is deactivated`);
      row.status = 'ERROR';
      continue;
    }
    if (!['faculty', 'hod'].includes(user.role)) {
      row.errors.push(`"${row.staffEmail}" is not a Faculty or HOD account`);
      row.status = 'ERROR';
      continue;
    }
    row.staffId   = user._id.toString();
    row.staffName = user.name;
    row.staffRole = user.role;
  }

  // ── STEP 6: Cross-row conflict detection (within the upload) ───────────────
  const resolvedRows = rawRows.filter(r => r.status === 'VALID');

  for (let i = 0; i < resolvedRows.length; i++) {
    for (let j = i + 1; j < resolvedRows.length; j++) {
      const a = resolvedRows[i];
      const b = resolvedRows[j];

      const aStart = buildDateTime(a.parsedDate, a.parsedStart);
      const aEnd   = buildDateTime(a.parsedDate, a.parsedEnd);
      const bStart = buildDateTime(b.parsedDate, b.parsedStart);
      const bEnd   = buildDateTime(b.parsedDate, b.parsedEnd);

      if (!timesOverlap(aStart, aEnd, bStart, bEnd)) continue;

      // Staff conflict
      if (a.staffId && b.staffId && a.staffId === b.staffId) {
        const msg = `Staff conflict with Row ${b.excelRowNumber} — same person assigned to overlapping duties`;
        if (a.status !== 'ERROR') { a.status = 'CONFLICT'; a.errors.push(msg); }
        const msgB = `Staff conflict with Row ${a.excelRowNumber} — same person assigned to overlapping duties`;
        if (b.status !== 'ERROR') { b.status = 'CONFLICT'; b.errors.push(msgB); }
      }

      // Room conflict
      if (a.room && b.room && a.room.toLowerCase() === b.room.toLowerCase() &&
          a.building?.toLowerCase() === b.building?.toLowerCase()) {
        const msg = `Room conflict with Row ${b.excelRowNumber} — same room booked for overlapping time`;
        if (a.status !== 'ERROR') { a.status = 'CONFLICT'; a.errors.push(msg); }
        const msgB = `Room conflict with Row ${a.excelRowNumber} — same room booked for overlapping time`;
        if (b.status !== 'ERROR') { b.status = 'CONFLICT'; b.errors.push(msgB); }
      }
    }
  }

  // ── STEP 7: DB conflict detection for remaining clean rows ─────────────────
  const cleanRows = rawRows.filter(r => r.status === 'VALID' && r.staffId);

  if (cleanRows.length > 0) {
    // Group by time window for efficiency
    const groupKey = r => `${buildDateTime(r.parsedDate, r.parsedStart)}__${buildDateTime(r.parsedDate, r.parsedEnd)}`;
    const timeGroups = {};
    for (const row of cleanRows) {
      const key = groupKey(row);
      if (!timeGroups[key]) timeGroups[key] = { rows: [], start: buildDateTime(row.parsedDate, row.parsedStart), end: buildDateTime(row.parsedDate, row.parsedEnd) };
      timeGroups[key].rows.push(row);
    }

    for (const group of Object.values(timeGroups)) {
      const userIds = group.rows.map(r => r.staffId);
      const dbConflicts = await findConflicts(userIds, group.start, group.end);

      for (const conflict of dbConflicts) {
        const row = group.rows.find(r => r.staffId === conflict.userId);
        if (row && row.status === 'VALID') {
          row.status = 'CONFLICT';
          row.errors.push(`DB conflict: ${conflict.reason}`);
          row.conflictDetail = conflict;
        }
      }
    }
  }

  // ── STEP 8: Build final RowResult[] ────────────────────────────────────────
  const validationResults = rawRows.map(r => ({
    excelRowNumber: r.excelRowNumber,
    status:         r.status,
    examName:       r.examName,
    examType:       r.examType,
    subject:        r.subject,
    subjectCode:    r.subjectCode,
    course:         r.course,
    semester:       r.semester,
    session:        r.session,
    date:           r.parsedDate ? r.parsedDate.toISOString().split('T')[0] : null,
    staffEmail:     r.staffEmail,
    staffName:      r.staffName || null,
    staffId:        r.staffId || null,
    staffRole:      r.staffRole || null,
    dutyType:       r.dutyType,
    reportingTime:  r.parsedRep,
    startTime:      r.parsedStart,
    endTime:        r.parsedEnd,
    campus:         r.campus,
    building:       r.building,
    room:           r.room,
    errors:         r.errors,
    conflictDetail: r.conflictDetail || null,

    // Pre-parsed duty data for confirm step (no re-parsing needed)
    parsedDutyData: r.status === 'VALID' ? {
      examName:      r.examName,
      examType:      r.examType,
      subject:       r.subject,
      subjectCode:   r.subjectCode,
      course:        r.course,
      semester:      r.semester,
      date:          r.parsedDate,
      session:       r.session,
      reportingTime: r.parsedRep ? buildDateTime(r.parsedDate, r.parsedRep) : buildDateTime(r.parsedDate, r.parsedStart),
      startTime:     buildDateTime(r.parsedDate, r.parsedStart),
      endTime:       buildDateTime(r.parsedDate, r.parsedEnd),
      location:      { campus: r.campus, building: r.building, room: r.room },
      instructions:  r.instructions || '',
      matter:        r.matter || ''
    } : null,
    parsedAssignment: r.status === 'VALID' ? {
      userId:   r.staffId,
      role:     r.staffRole,
      dutyType: r.dutyType
    } : null
  }));

  const finalValidRows   = validationResults.filter(r => r.status === 'VALID').length;
  const finalInvalidRows = validationResults.length - finalValidRows;

  return {
    fileHash,
    totalRows:    rawRows.length,
    validRows:    finalValidRows,
    invalidRows:  finalInvalidRows,
    validationResults,
    allValid:     finalInvalidRows === 0
  };
};

module.exports = { validateExcelBuffer, hashBuffer, MAX_IMPORT_ROWS };

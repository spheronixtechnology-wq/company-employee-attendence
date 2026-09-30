/**
 * examDutyImport.controller.js
 * Handles all 5 Excel import endpoints:
 *   GET  /template              — blank .xlsx template download
 *   GET  /faculty-list          — faculty/HOD master list download
 *   POST /import/preview        — upload + validate
 *   POST /import/confirm        — atomic commit (idempotency lock)
 *   GET  /import/:id/errors     — error report download
 */
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const ExamDutyImport = require('../models/ExamDutyImport');
const User = require('../models/User');
const Team = require('../models/Team');
const { validateExcelBuffer } = require('../services/ExamDutyImportService');
const { createDutyWithAssignments, notifyAssignedStaff } = require('../services/ExamDutyService');

const IMPORT_TTL_HOURS = 24;

// ─── Helper: enforce expiry at API level ──────────────────────────────────────
const isExpired = (importRecord) => importRecord.expiresAt && new Date(importRecord.expiresAt) < new Date();

// ─── GET /template ────────────────────────────────────────────────────────────
exports.downloadTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Exam Duty Template');

    const COLS = [
      { header: 'Exam Name *',            key: 'examName',     width: 28 },
      { header: 'Exam Type *',            key: 'examType',     width: 20 },
      { header: 'Subject *',              key: 'subject',      width: 22 },
      { header: 'Subject Code *',         key: 'subjectCode',  width: 16 },
      { header: 'Course *',               key: 'course',       width: 18 },
      { header: 'Semester *',             key: 'semester',     width: 12 },
      { header: 'Exam Date *',            key: 'examDate',     width: 16 },
      { header: 'Session *',              key: 'session',      width: 16 },
      { header: 'Reporting Time *',       key: 'reportingTime',width: 18 },
      { header: 'Start Time *',           key: 'startTime',    width: 14 },
      { header: 'End Time *',             key: 'endTime',      width: 14 },
      { header: 'Campus *',              key: 'campus',       width: 16 },
      { header: 'Building *',            key: 'building',     width: 16 },
      { header: 'Room *',                key: 'room',         width: 14 },
      { header: 'Duty Type *',           key: 'dutyType',     width: 22 },
      { header: 'Assigned Staff Email *',key: 'staffEmail',   width: 30 },
      { header: 'Instructions',           key: 'instructions', width: 30 },
      { header: 'Matter',                 key: 'matter',       width: 25 },
    ];

    ws.columns = COLS;

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B5BDB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height    = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Dropdown data validation
    for (let row = 2; row <= 1001; row++) {
      ws.getCell(`H${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"Morning,Afternoon,Full Day"']
      };
      ws.getCell(`B${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"End Semester,Mid Semester,Internal Assessment,Practical"']
      };
      ws.getCell(`O${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"Invigilator,Chief Superintendent,Deputy Superintendent,Reliever,Examination Squad,Support Staff"']
      };
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="exam-duty-template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating template:', err);
    res.status(500).json({ success: false, message: 'Failed to generate template' });
  }
};

// ─── GET /faculty-list ────────────────────────────────────────────────────────
exports.downloadFacultyList = async (req, res) => {
  try {
    const staff = await User.find({
      role: { $in: ['faculty', 'hod'] },
      isActive: true,
      deletedAt: null
    }).select('name email role designation department teamId').populate('teamId', 'name').lean();

    const teams = await Team.find({}).lean();

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Faculty & HOD List');

    ws.columns = [
      { header: 'Name',          key: 'name',        width: 25 },
      { header: 'Email',         key: 'email',        width: 32 },
      { header: 'Role',          key: 'role',         width: 12 },
      { header: 'Designation',   key: 'designation',  width: 22 },
      { header: 'Department',    key: 'department',   width: 22 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F9E44' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height    = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const u of staff) {
      let deptName = u.department || u.teamId?.name;
      if (!deptName && u.role === 'hod') {
        const managedTeam = teams.find(t => t.leadUserId?.toString() === u._id.toString());
        if (managedTeam) deptName = managedTeam.name;
      }

      ws.addRow({
        name:        u.name,
        email:       u.email,
        role:        u.role,
        designation: u.designation || '—',
        department:  deptName || '—'
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="faculty-hod-list.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating faculty list:', err);
    res.status(500).json({ success: false, message: 'Failed to generate staff list' });
  }
};

// ─── POST /import/preview ─────────────────────────────────────────────────────
exports.previewImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please attach an .xlsx file.' });
    }

    const buffer = req.file.buffer;
    const fileName = req.file.originalname;

    // Run full validation pipeline
    const result = await validateExcelBuffer(buffer, fileName);

    // File-level error stops everything
    if (result.fileError) {
      return res.status(422).json({ success: false, message: result.fileError });
    }

    // Save import record
    const expiresAt = new Date(Date.now() + IMPORT_TTL_HOURS * 60 * 60 * 1000);

    const importRecord = await ExamDutyImport.create({
      uploadedBy:        req.user._id,
      fileName,
      fileHash:          result.fileHash,
      totalRows:         result.totalRows,
      validRows:         result.validRows,
      invalidRows:       result.invalidRows,
      status:            result.allValid ? 'VALID' : 'INVALID',
      validationResults: result.validationResults,
      expiresAt
    });

    res.status(200).json({
      success: true,
      data: {
        importId:          importRecord._id,
        status:            importRecord.status,
        totalRows:         result.totalRows,
        validRows:         result.validRows,
        invalidRows:       result.invalidRows,
        allValid:          result.allValid,
        validationResults: result.validationResults,
        expiresAt
      }
    });
  } catch (err) {
    console.error('Error in import preview:', err);
    res.status(500).json({ success: false, message: 'Import validation failed', error: err.message });
  }
};

// ─── POST /import/confirm ─────────────────────────────────────────────────────
exports.confirmImport = async (req, res) => {
  try {
    const { importId } = req.body;
    if (!importId) {
      return res.status(400).json({ success: false, message: 'importId is required' });
    }

    // ── Idempotency lock: atomic VALID → CONFIRMING ────────────────────────
    const importRecord = await ExamDutyImport.findOneAndUpdate(
      {
        _id: importId,
        uploadedBy: req.user._id,
        status: 'VALID'
      },
      { $set: { status: 'CONFIRMING' } },
      { new: true }
    );

    if (!importRecord) {
      // Could be: not found, wrong owner, already CONFIRMING/CONFIRMED/INVALID
      const existing = await ExamDutyImport.findById(importId);
      if (!existing) return res.status(404).json({ success: false, message: 'Import record not found.' });
      if (existing.uploadedBy.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized.' });
      if (isExpired(existing)) return res.status(410).json({ success: false, message: 'Import has expired. Please re-upload.' });
      return res.status(409).json({ success: false, message: `Cannot confirm import in state: ${existing.status}.` });
    }

    // ── API-level expiry check ─────────────────────────────────────────────
    if (isExpired(importRecord)) {
      await ExamDutyImport.findByIdAndUpdate(importId, { status: 'EXPIRED' });
      return res.status(410).json({ success: false, message: 'Import has expired. Please re-upload.' });
    }

    // ── MongoDB transaction ────────────────────────────────────────────────
    const session = await mongoose.startSession();
    const createdDutyIds = [];
    const allAssignments = [];

    try {
      await session.withTransaction(async () => {
        for (const row of importRecord.validationResults) {
          if (row.status !== 'VALID' || !row.parsedDutyData || !row.parsedAssignment) continue;

          const { duty, assignments } = await createDutyWithAssignments(
            row.parsedDutyData,
            [row.parsedAssignment],
            req.user._id,
            session
          );
          createdDutyIds.push(duty._id);
          allAssignments.push(...assignments);
        }
      });
    } catch (txErr) {
      await ExamDutyImport.findByIdAndUpdate(importId, { status: 'FAILED' });
      console.error('Transaction failed:', txErr);
      return res.status(500).json({ success: false, message: 'Failed to create exam duties. Please try again.', error: txErr.message });
    } finally {
      session.endSession();
    }

    // ── Mark CONFIRMED (outside transaction) ──────────────────────────────
    await ExamDutyImport.findByIdAndUpdate(importId, {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      createdExamDutyIds: createdDutyIds
    });

    // ── Send notifications AFTER commit ───────────────────────────────────
    // Group assignments by their duty for richer notification payload
    for (const assignment of allAssignments) {
      try {
        const { getIo } = require('../socket');
        getIo().to(`user_${assignment.userId}`).emit('exam_duty:new_assignment', {
          assignmentId: assignment._id,
          message: 'You have been assigned a new Exam Duty'
        });
      } catch {
        // Non-fatal — notification failure must not affect the response
      }
    }

    res.status(201).json({
      success: true,
      data: {
        dutiesCreated:  createdDutyIds.length,
        createdDutyIds,
        importId
      }
    });
  } catch (err) {
    console.error('Error in import confirm:', err);
    res.status(500).json({ success: false, message: 'Confirm failed', error: err.message });
  }
};

// ─── GET /import/:importId/errors ─────────────────────────────────────────────
exports.downloadErrorReport = async (req, res) => {
  try {
    const importRecord = await ExamDutyImport.findById(req.params.importId);
    if (!importRecord) return res.status(404).json({ success: false, message: 'Import not found.' });
    if (importRecord.uploadedBy.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized.' });

    const errorRows = importRecord.validationResults.filter(r => r.status !== 'VALID');

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Error Report');

    ws.columns = [
      { header: 'Excel Row',   key: 'row',    width: 12 },
      { header: 'Status',      key: 'status', width: 12 },
      { header: 'Exam Name',   key: 'exam',   width: 28 },
      { header: 'Subject',     key: 'subj',   width: 22 },
      { header: 'Date',        key: 'date',   width: 14 },
      { header: 'Staff Email', key: 'email',  width: 30 },
      { header: 'Errors',      key: 'errors', width: 60 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE4BDB' } };
    headerRow.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const r of errorRows) {
      const dataRow = ws.addRow({
        row:    r.excelRowNumber,
        status: r.status,
        exam:   r.examName || '—',
        subj:   r.subject  || '—',
        date:   r.date     || '—',
        email:  r.staffEmail || '—',
        errors: r.errors.join('; ')
      });
      dataRow.getCell('errors').alignment = { wrapText: true };
      if (r.status === 'ERROR')    dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEEE' } };
      if (r.status === 'CONFLICT') dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    }

    const safeFileName = importRecord.fileName.replace(/[^a-z0-9.]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="errors_${safeFileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating error report:', err);
    res.status(500).json({ success: false, message: 'Failed to generate error report' });
  }
};

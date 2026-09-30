const express = require('express');
const router = express.Router();
const examDutyController       = require('../controllers/examDuty.controller');
const examDutyImportController = require('../controllers/examDutyImport.controller');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

// Upload middleware (memory storage, .xlsx only, 5MB)
const multer = require('multer');
const path   = require('path');
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xlsx and .xls files are accepted'), false);
  }
}).single('file');

const uploadExcel = (req, res, next) => {
  excelUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};

// ── All routes require authentication ─────────────────────────────────────────
router.use(authenticate);

// ════════════════════════════════════════════════════════════════════════════
// STATIC NAMED ROUTES  (must come before /:id to prevent Express param capture)
// ════════════════════════════════════════════════════════════════════════════

// Principal: Conflict checker (manual form)
router.post('/conflicts', authorize('principal'), examDutyController.checkConflicts);

// Principal: Personnel picker (manual form)
router.get('/personnel', authorize('principal'), examDutyController.getAvailablePersonnel);

// ── Excel Import routes ────────────────────────────────────────────────────
router.get('/template',     authorize('principal'), examDutyImportController.downloadTemplate);
router.get('/faculty-list', authorize('principal'), examDutyImportController.downloadFacultyList);
router.post('/import/preview', authorize('principal'), uploadExcel, examDutyImportController.previewImport);
router.post('/import/confirm', authorize('principal'), examDutyImportController.confirmImport);

// Faculty & HOD: My duties
router.get('/my-duties', examDutyController.getMyDuties);

// ── Principal: Create + list ───────────────────────────────────────────────
router.post('/', authorize('principal'), examDutyController.createExamDuty);
router.get('/',  authorize('principal'), examDutyController.getAllExamDuties);

// ── Assignment actions (static sub-paths — before /:id) ───────────────────
router.post('/assignments/:id/respond',   examDutyController.respondToAssignment);
router.post('/assignments/:id/report',    examDutyController.reportForDuty);
router.post('/assignments/:assignmentId/reassign', authorize('principal'), examDutyController.reassignDuty);

// ── Import error report (sub-path under /import — before /:id) ───────────
router.get('/import/:importId/errors', authorize('principal'), examDutyImportController.downloadErrorReport);

// ════════════════════════════════════════════════════════════════════════════
// DYNAMIC /:id  ALWAYS LAST
// ════════════════════════════════════════════════════════════════════════════
router.get('/:id', authorize('principal'), examDutyController.getExamDutyDetails);

module.exports = router;

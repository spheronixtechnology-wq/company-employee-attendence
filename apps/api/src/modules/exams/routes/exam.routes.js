const express = require('express');
const router = express.Router();
const multer = require('multer');
const allocationController = require('../controllers/allocation.controller');

// Configure multer for in-memory storage (can be configured to disk/S3 later)
const upload = multer({ storage: multer.memoryStorage() });

// Scaffolded API endpoints based on Phase 5
router.post('/create', allocationController.createExam);
router.get('/', allocationController.getExams);
router.get('/:id', allocationController.getExam);
router.delete('/:id', allocationController.deleteExam);

router.post('/:id/upload', upload.fields([
  { name: 'students', maxCount: 1 },
  { name: 'rooms', maxCount: 1 },
  { name: 'faculty', maxCount: 1 }
]), allocationController.uploadData);

// router.post('/:id/validate', ...);
router.post('/:id/generate', allocationController.generatePlan);
// router.post('/:id/regenerate', ...);
router.get('/:id/preview', allocationController.getPreview);
// router.get('/:id/seating', ...);
// router.get('/:id/invigilators', ...);
// router.post('/:id/finalize', ...);
router.post('/:id/publish', allocationController.publishPlan);
router.get('/:id/export/pdf', allocationController.exportPdf);
router.get('/:id/export/word', allocationController.exportWord);
router.get('/:id/export/students/pdf', allocationController.exportStudentsPdf);
router.get('/:id/export/students/word', allocationController.exportStudentsWord);
router.get('/:id/export/faculty/pdf', allocationController.exportFacultyPdf);
router.get('/:id/export/faculty/word', allocationController.exportFacultyWord);

module.exports = router;

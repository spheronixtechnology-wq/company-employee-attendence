const mongoose = require('mongoose');

const examStudentSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  rollNumber: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  branch: { type: String, required: true, trim: true, uppercase: true },
  year: { type: String, trim: true },
  section: { type: String, trim: true },
  
  // Optional metadata
  college: { type: String, trim: true },
  gender: { type: String, trim: true },
  
  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Ensure unique roll number per exam
examStudentSchema.index({ examId: 1, rollNumber: 1 }, { unique: true });
// Index on branch for fast aggregation
examStudentSchema.index({ examId: 1, branch: 1 });

module.exports = mongoose.model('ExamStudent', examStudentSchema);

const mongoose = require('mongoose');

const examFacultySchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  facultyId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  department: { type: String, trim: true, uppercase: true },
  mobile: { type: String, trim: true },
  
  // Workload and constraint metadata
  available: { type: Boolean, default: true },
  maximumDuties: { type: Number, default: 1 },
  preferredSession: { type: String, enum: ['FN', 'AN', 'Morning', 'Afternoon', 'Evening', 'ANY'], default: 'ANY' },
  
  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Ensure unique faculty per exam
examFacultySchema.index({ examId: 1, facultyId: 1 }, { unique: true });

module.exports = mongoose.model('ExamFaculty', examFacultySchema);

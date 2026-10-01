const mongoose = require('mongoose');

const invigilatorDutySchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  generationId: { type: Number, required: true }, // Ties to a specific regeneration version
  
  examFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamFaculty', required: true },
  facultyId: { type: String, required: true }, // the ID from master data
  
  examRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamRoom', required: true },
  roomNumber: { type: String, required: true },

  // When published, this duty becomes active and is read by the existing attendance system
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'REVOKED'],
    default: 'DRAFT'
  },

  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Ensure a faculty member is not assigned to the same room twice in the same generation
invigilatorDutySchema.index({ examId: 1, generationId: 1, examFacultyId: 1, examRoomId: 1 }, { unique: true });

// This index allows the existing attendance system to quickly find ACTIVE duties for a specific faculty member
invigilatorDutySchema.index({ facultyId: 1, status: 1 });

module.exports = mongoose.model('InvigilatorDuty', invigilatorDutySchema);

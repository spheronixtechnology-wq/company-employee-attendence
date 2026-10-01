const mongoose = require('mongoose');

const seatingPlanSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  generationId: { type: Number, required: true }, // Ties to a specific regeneration version
  
  // Room relationship
  examRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamRoom', required: true },
  roomNumber: { type: String, required: true },
  
  // Student relationship (null if it's an intentionally empty seat)
  examStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamStudent' },
  rollNumber: { type: String }, // Stored redundantly for faster queries
  branch: { type: String },     // Stored redundantly for faster constraint rendering
  
  // Positional Data
  row: { type: Number, required: true },
  column: { type: Number, required: true },
  seatIdentifier: { type: String, required: true }, // e.g. R101-R01-C01

  // Status flags
  isEmptySeat: { type: Boolean, default: false },

  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Ensure a seat cannot be duplicated in the same generation and room
seatingPlanSchema.index({ examId: 1, generationId: 1, roomNumber: 1, row: 1, column: 1 }, { unique: true });
// Ensure a student isn't seated twice in the same generation
seatingPlanSchema.index({ examId: 1, generationId: 1, examStudentId: 1 }, { unique: true, partialFilterExpression: { isEmptySeat: false } });

module.exports = mongoose.model('SeatingPlan', seatingPlanSchema);

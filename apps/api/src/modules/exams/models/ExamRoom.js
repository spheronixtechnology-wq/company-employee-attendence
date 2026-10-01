const mongoose = require('mongoose');

const examRoomSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  roomNumber: { type: String, required: true, trim: true },
  rows: { type: Number, required: true, min: 1 },
  columns: { type: Number, required: true, min: 1 },
  capacity: { type: Number, required: true, min: 1 }, // Typically rows * columns
  
  // Optional metadata
  floor: { type: String, trim: true },
  block: { type: String, trim: true },

  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Ensure unique room per exam
examRoomSchema.index({ examId: 1, roomNumber: 1 }, { unique: true });

module.exports = mongoose.model('ExamRoom', examRoomSchema);

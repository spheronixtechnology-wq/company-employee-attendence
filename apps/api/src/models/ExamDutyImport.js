const mongoose = require('mongoose');

const rowResultSchema = new mongoose.Schema({
  excelRowNumber: { type: Number, required: true },
  status:         { type: String, enum: ['VALID', 'ERROR', 'CONFLICT'], required: true },
  examName:       String,
  subject:        String,
  date:           String,
  staffEmail:     String,
  staffName:      String,   // resolved from DB
  staffId:        mongoose.Schema.Types.ObjectId,
  staffRole:      String,
  dutyType:       String,
  startTime:      String,
  endTime:        String,
  room:           String,
  errors:         [String],
  conflictDetail: mongoose.Schema.Types.Mixed,

  // Parsed & resolved fields used during confirm (kept to avoid re-parsing)
  parsedDutyData:    mongoose.Schema.Types.Mixed,
  parsedAssignment:  mongoose.Schema.Types.Mixed,
}, { _id: false });

const examDutyImportSchema = new mongoose.Schema({
  uploadedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName:           { type: String, required: true },
  fileHash:           { type: String, required: true }, // SHA-256 of buffer

  totalRows:          { type: Number, default: 0 },
  validRows:          { type: Number, default: 0 },
  invalidRows:        { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['UPLOADED', 'VALIDATING', 'VALID', 'INVALID', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'EXPIRED'],
    default: 'UPLOADED'
  },

  validationResults:  [rowResultSchema],
  createdExamDutyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExamDuty' }],

  confirmedAt: Date,
  expiresAt:   { type: Date, required: true }, // Enforced at API level AND by TTL index
}, {
  timestamps: true
});

// MongoDB TTL index — physical cleanup after expiry (eventual, may lag by up to 60s)
examDutyImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
examDutyImportSchema.index({ uploadedBy: 1, status: 1 });

module.exports = mongoose.model('ExamDutyImport', examDutyImportSchema);

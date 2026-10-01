const mongoose = require('mongoose');

const uploadMetadataSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assuming a User model exists
  storageKey: { type: String }, // For S3/cloud storage reference
});

const examSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  session: { type: String, enum: ['FN', 'AN', 'Morning', 'Afternoon', 'Evening'], required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  subject: { type: String, trim: true },
  year: { type: String },
  semester: { type: String },

  // Configurable Constraints
  rules: {
    minimumStudentsPerBranchPerRoom: { type: Number, default: 5 },
    invigilatorsPerRoom: { type: Number, default: 1 },
  },

  // Lifecycle Status
  status: {
    type: String,
    enum: ['DRAFT', 'VALIDATED', 'GENERATED', 'FINALIZED', 'PUBLISHED', 'COMPLETED'],
    default: 'DRAFT'
  },

  // File Upload Metadata for Audit
  uploads: {
    students: uploadMetadataSchema,
    rooms: uploadMetadataSchema,
    faculty: uploadMetadataSchema
  },

  // Audit Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);

const mongoose = require('mongoose');

/**
 * Records that a date-scoped scheduled job finished successfully.
 * Used as the source of truth for "has the EOD absence run happened for this date"
 * and for startup catch-up of missed runs.
 */
const jobRunMarkerSchema = new mongoose.Schema(
  {
    job: { type: String, required: true }, // e.g. 'daily_absent_marking'
    date: { type: String, required: true }, // 'YYYY-MM-DD' (Asia/Kolkata business date)
    completedAt: { type: Date, required: true },
    processedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

jobRunMarkerSchema.index({ job: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('JobRunMarker', jobRunMarkerSchema);

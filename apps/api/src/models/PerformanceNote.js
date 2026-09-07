const mongoose = require('mongoose');

const performanceNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    period: {
      type: String,
      required: true,
      trim: true,
      // e.g. "2024-Q3", "September 2024", "2024-W35"
    },
    rating: {
      type: Number,
      required: true,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    notes: {
      type: String,
      required: [true, 'Performance notes are required'],
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

performanceNoteSchema.index({ userId: 1, createdAt: -1 });
performanceNoteSchema.index({ teamId: 1, createdAt: -1 });

module.exports = mongoose.model('PerformanceNote', performanceNoteSchema);

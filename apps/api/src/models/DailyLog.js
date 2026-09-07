const mongoose = require('mongoose');

/**
 * DailyLog — supports both Technical and Marketing team field sets.
 * All team-specific fields are optional at schema level;
 * business logic validates required fields based on team type.
 */
const dailyLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    logDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    hoursSpent: {
      type: Number,
      required: true,
      min: [0.5, 'Minimum 0.5 hours'],
      max: [24, 'Cannot exceed 24 hours'],
    },

    // ── Technical Team Fields ──────────────────────────
    taskTitle: { type: String, trim: true, default: null },
    projectName: { type: String, trim: true, default: null },
    ticketId: { type: String, trim: true, default: null },
    blockers: { type: String, trim: true, default: null },

    // ── Marketing Team Fields ──────────────────────────
    campaignName: { type: String, trim: true, default: null },
    platform: { type: String, trim: true, default: null },
    outputSummary: { type: String, trim: true, default: null },

    // ── Common ────────────────────────────────────────
    attachmentUrl: { type: String, default: null },

    status: {
      type: String,
      enum: ['submitted', 'overridden'],
      default: 'submitted',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },

    // Override tracking
    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    overrideReason: {
      type: String,
      trim: true,
      default: null,
    },
    overriddenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One daily log per user per day
dailyLogSchema.index({ userId: 1, logDate: 1 }, { unique: true });
dailyLogSchema.index({ teamId: 1, logDate: 1 });

module.exports = mongoose.model('DailyLog', dailyLogSchema);

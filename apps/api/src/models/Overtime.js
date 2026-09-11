const mongoose = require('mongoose');

const overtimeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: [true, 'Date is required'],
      index: true,
    },

    // ── Stage 1: Permission Request (Pre-OT) ──────────────────────────────
    requestedStartTime: {
      type: Date,
      required: [true, 'Requested start time is required'],
    },
    requestedEndTime: {
      type: Date,
      required: [true, 'Requested end time is required'],
    },
    expectedDurationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      required: [true, 'Overtime reason is required'],
      trim: true,
    },
    permissionStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    permissionDecisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    permissionDecisionAt: {
      type: Date,
      default: null,
    },
    permissionNote: {
      type: String,
      default: null,
    },

    // ── Execution & Session Tracking (During OT) ─────────────────────────
    actualStartTime: {
      type: Date,
      default: null,
    },
    actualEndTime: {
      type: Date,
      default: null,
    },
    recordedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Stage 2: Work Submission & Verification (Post-OT) ────────────────
    workDetails: {
      type: String,
      default: null,
      trim: true,
    },
    workSubmittedAt: {
      type: Date,
      default: null,
    },
    workVerificationStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
      index: true,
    },
    workVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    workVerifiedAt: {
      type: Date,
      default: null,
    },
    workVerificationNote: {
      type: String,
      default: null,
    },
    approvedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Combined Lifecycle Status ─────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'permission_pending',      // Employee requested OT, awaiting Manager Stage 1 decision
        'permission_rejected',     // Manager denied permission; OT cannot start
        'permission_approved',     // Manager permitted OT; Employee may start session
        'in_progress',             // Employee currently clocked in to OT
        'work_verification_pending', // OT finished, work details submitted, awaiting Manager Stage 2 review
        'completed_approved',      // Manager verified work; approvedMinutes added to employee OT total
        'completed_rejected',      // Manager rejected work; approvedMinutes = 0, not added to total
        'cancelled',               // Employee cancelled request before starting
      ],
      default: 'permission_pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup
overtimeSchema.index({ userId: 1, date: 1 });
overtimeSchema.index({ teamId: 1, status: 1 });
overtimeSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Overtime', overtimeSchema);

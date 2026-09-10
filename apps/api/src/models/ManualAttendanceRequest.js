const mongoose = require('mongoose');

const manualAttendanceRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    requestDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionNote: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

manualAttendanceRequestSchema.index({ userId: 1, requestDate: 1 });
manualAttendanceRequestSchema.index({ teamId: 1, status: 1 });
manualAttendanceRequestSchema.index({ status: 1 });

module.exports = mongoose.model('ManualAttendanceRequest', manualAttendanceRequestSchema);

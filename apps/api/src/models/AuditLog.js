const mongoose = require('mongoose');

/**
 * AuditLog — immutable append-only record of all sensitive actions.
 * Never update or delete audit logs.
 * Every override, permission change, or system setting change must produce an entry.
 */
const auditLogSchema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedByRole: {
      type: String,
      enum: ['admin', 'manager', 'employee', 'system'],
      required: true,
    },
    action: {
      type: String,
      required: true,
      // Use AUDIT_ACTIONS constants from shared/auditActions.js
    },
    targetCollection: {
      type: String,
      trim: true,
      default: null,
      // e.g. 'attendance', 'leave_requests', 'users'
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // ID of the specific document affected
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      // The user this action was performed ON (if applicable)
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
      // Required for override actions, optional for others
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      // Additional context: previous value, new value, etc.
    },
    ipAddress: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  }
);

auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

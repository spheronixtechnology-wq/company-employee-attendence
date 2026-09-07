const AuditLog = require('../models/AuditLog');

/**
 * Writes an audit log entry for any sensitive action.
 * This function never throws — audit failures are logged to console but don't break the main flow.
 *
 * @param {Object} params
 * @param {string} params.action - AUDIT_ACTIONS constant
 * @param {Object} params.performedBy - req.user object
 * @param {string} [params.targetCollection]
 * @param {string} [params.targetId]
 * @param {string} [params.targetUserId]
 * @param {string} [params.teamId]
 * @param {string} [params.reason]
 * @param {Object} [params.metadata]
 * @param {string} [params.ipAddress]
 */
const writeAuditLog = async ({
  action,
  performedBy,
  targetCollection = null,
  targetId = null,
  targetUserId = null,
  teamId = null,
  reason = null,
  metadata = null,
  ipAddress = null,
}) => {
  try {
    await AuditLog.create({
      performedBy: performedBy._id || performedBy,
      performedByRole: performedBy.role || 'system',
      action,
      targetCollection,
      targetId,
      targetUserId,
      teamId,
      reason,
      metadata,
      ipAddress,
    });
  } catch (err) {
    // Audit log failures should not break core operations
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
};

module.exports = { writeAuditLog };

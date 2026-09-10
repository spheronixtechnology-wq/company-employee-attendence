const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveType = require('../models/LeaveType');
const User = require('../models/User');
const { writeAuditLog } = require('./audit.service');
const { createNotification } = require('./notification.service');
const { countDaysBetween, getCurrentYear } = require('../utils/dateUtils');
const { AUDIT_ACTIONS } = require('../../../../packages/shared/auditActions');
const { emitToTeam, emitToManagers } = require('../socket');

/**
 * Employee applies for leave.
 */
const applyLeave = async (paramsOrUserId, maybeLeaveData) => {
  const params = typeof paramsOrUserId === 'object' && paramsOrUserId !== null && !paramsOrUserId._bsontype
    ? paramsOrUserId
    : { userId: paramsOrUserId, ...(maybeLeaveData || {}) };
  const { userId, leaveTypeId, startDate, endDate, reason } = params;

  // Validate leave type exists
  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType || !leaveType.isActive) {
    throw { statusCode: 404, message: 'Leave type not found or inactive.' };
  }

  const totalDays = countDaysBetween(startDate, endDate);

  // Check leave balance
  const currentYear = getCurrentYear();
  let balance = await LeaveBalance.findOne({ userId, leaveTypeId, year: currentYear });
  if (!balance) {
    await initializeLeaveBalances(userId);
    balance = await LeaveBalance.findOne({ userId, leaveTypeId, year: currentYear });
  }

  if (!balance) {
    throw { statusCode: 400, message: 'Leave balance not found. Contact admin.' };
  }

  if (leaveType.code !== 'UL' && balance.used + totalDays > balance.allocated) {
    throw {
      statusCode: 400,
      message: `Insufficient leave balance. Available: ${balance.allocated - balance.used} day(s).`,
    };
  }

  // Check for overlapping leave requests
  const overlap = await LeaveRequest.findOne({
    userId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });

  if (overlap) {
    throw { statusCode: 400, message: 'You already have a pending or approved leave overlapping these dates.' };
  }

  const user = await User.findById(userId).populate('teamId');

  const request = await LeaveRequest.create({
    userId,
    teamId: user.teamId?._id,
    leaveTypeId,
    startDate,
    endDate,
    totalDays,
    reason,
    status: 'pending',
  });

  // Notify manager if assigned
  if (user.teamId?.leadUserId) {
    await createNotification({
      userId: user.teamId.leadUserId,
      type: 'leave_applied',
      title: 'New Leave Request',
      message: `${user.name} has applied for ${totalDays} day(s) of ${leaveType.name} leave.`,
      relatedId: request._id,
    });
  }

  const populated = await LeaveRequest.findById(request._id)
    .populate('userId', 'name email')
    .populate('leaveTypeId', 'name code');

  if (user.teamId?._id) {
    emitToTeam(user.teamId._id, 'leave:request_created', { request: populated || request });
  }
  emitToManagers('leave:request_created', { request: populated || request });

  return request;
};

/**
 * Manager or Admin makes a decision on a leave request.
 * Manager can only act on own team's pending requests (not their own).
 */
const makeLeaveDecision = async ({ leaveId, decidedBy, decision, decisionNote }) => {
  const leave = await LeaveRequest.findById(leaveId).populate('userId', 'name teamId');

  if (!leave) throw { statusCode: 404, message: 'Leave request not found.' };
  if (leave.status !== 'pending') {
    throw { statusCode: 400, message: `Leave request is already ${leave.status}.` };
  }

  // Manager cannot approve own leave
  if (decidedBy.role === 'manager' && leave.userId.toString() === decidedBy._id.toString()) {
    throw { statusCode: 403, message: 'You cannot approve your own leave request.' };
  }

  leave.status = decision;
  leave.decidedBy = decidedBy._id;
  leave.decidedAt = new Date();
  leave.decisionNote = decisionNote || null;
  await leave.save();

  // If approved, deduct from balance
  if (decision === 'approved') {
    await LeaveBalance.findOneAndUpdate(
      { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year: new Date(leave.startDate).getFullYear() },
      { $inc: { used: leave.totalDays } }
    );
  }

  // Notify employee
  await createNotification({
    userId: leave.userId,
    type: decision === 'approved' ? 'leave_approved' : 'leave_rejected',
    title: `Leave ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
    message: `Your leave request (${leave.startDate} to ${leave.endDate}) has been ${decision}.${decisionNote ? ' Note: ' + decisionNote : ''}`,
    relatedId: leave._id,
  });

  await writeAuditLog({
    action: decision === 'approved' ? AUDIT_ACTIONS.LEAVE_APPROVED : AUDIT_ACTIONS.LEAVE_REJECTED,
    performedBy: decidedBy,
    targetCollection: 'leave_requests',
    targetId: leave._id,
    targetUserId: leave.userId,
    metadata: { decision, totalDays: leave.totalDays },
  });

  return leave;
};

/**
 * Admin overrides a manager's leave decision.
 */
const overrideLeaveDecision = async ({ leaveId, adminUser, newDecision, overrideReason }) => {
  const leave = await LeaveRequest.findById(leaveId);
  if (!leave) throw { statusCode: 404, message: 'Leave request not found.' };

  const previousStatus = leave.status;

  // If reversing an approved leave, restore balance
  if (previousStatus === 'approved' && newDecision !== 'approved') {
    await LeaveBalance.findOneAndUpdate(
      { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year: new Date(leave.startDate).getFullYear() },
      { $inc: { used: -leave.totalDays } }
    );
  }

  // If approving a previously rejected leave, deduct balance
  if (previousStatus !== 'approved' && newDecision === 'approved') {
    await LeaveBalance.findOneAndUpdate(
      { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year: new Date(leave.startDate).getFullYear() },
      { $inc: { used: leave.totalDays } }
    );
  }

  leave.status = newDecision;
  leave.overriddenBy = adminUser._id;
  leave.overrideReason = overrideReason;
  leave.overriddenAt = new Date();
  await leave.save();

  await createNotification({
    userId: leave.userId,
    type: 'leave_overridden',
    title: 'Leave Decision Updated by Admin',
    message: `Your leave request has been overridden to "${newDecision}" by Admin. Reason: ${overrideReason}`,
    relatedId: leave._id,
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.LEAVE_DECISION_OVERRIDDEN,
    performedBy: adminUser,
    targetCollection: 'leave_requests',
    targetId: leave._id,
    targetUserId: leave.userId,
    reason: overrideReason,
    metadata: { previousStatus, newDecision },
  });

  return leave;
};

/**
 * Initialize leave balances for a new user (all active leave types for current year).
 */
const initializeLeaveBalances = async (userId) => {
  const currentYear = getCurrentYear();
  const leaveTypes = await LeaveType.find({ isActive: true });

  const balanceOps = leaveTypes.map((lt) => ({
    updateOne: {
      filter: { userId, leaveTypeId: lt._id, year: currentYear },
      update: { $setOnInsert: { userId, leaveTypeId: lt._id, year: currentYear, allocated: lt.annualQuota, used: 0 } },
      upsert: true,
    },
  }));

  if (balanceOps.length > 0) {
    await LeaveBalance.bulkWrite(balanceOps);
  }
};

module.exports = { applyLeave, makeLeaveDecision, overrideLeaveDecision, initializeLeaveBalances };

const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { writeAuditLog } = require('./audit.service');
const { createNotification } = require('./notification.service');
const { emitToUser } = require('../socket');
const { getTodayDateString, finalizeAttendanceCheckout, calcAttendanceMetrics } = require('../utils/dateUtils');

/**
 * Service to manage auto-checkout reason reviews and session reactivations.
 * Shared between Admin and Manager controllers to ensure state consistency.
 */

/**
 * Retrieves auto-checked out attendance records for a target date,
 * optionally filtered by team IDs (for managers) and search query.
 */
const getSessionReactivations = async ({ date, teamIds = null, search = '' }) => {
  const targetDate = date || getTodayDateString('Asia/Kolkata');

  // Build query for users if teamIds or search specified
  const userQuery = { deletedAt: null };
  if (teamIds && Array.isArray(teamIds)) {
    userQuery.teamId = { $in: teamIds };
  }
  if (search && search.trim()) {
    userQuery.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { email: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const matchingUsers = await User.find(userQuery).select('_id name email designation teamId role avatarUrl');
  const userIds = matchingUsers.map((u) => u._id);
  const userMap = new Map(matchingUsers.map((u) => [u._id.toString(), u]));

  // Query attendance records for the target date that were auto-checked out or have reactivation requests
  const attendances = await Attendance.find({
    date: targetDate,
    userId: { $in: userIds },
    $or: [
      { autoCheckedOut: true },
      { reactivationStatus: { $ne: null } },
      { outOfBoundsReason: { $ne: null } },
    ],
  })
    .populate({
      path: 'userId',
      select: 'name email designation avatarUrl teamId role',
      populate: { path: 'teamId', select: 'name' }
    })
    .populate('reactivationDecisionBy', 'name email role')
    .sort({ checkOutTime: -1, autoCheckoutAt: -1, updatedAt: -1 })
    .lean();

  // Compute date-scoped KPIs:
  // approvedCount strictly reflects sessions approved AND currently active/resumed
  const records = attendances.map((att) => {
    const isCurrentlyActive = att.status === 'present' && !att.checkOutTime;

    // Detect if an auto-checkout occurred AFTER a previous reactivation
    const autoCheckedOutAfterReactivation = Boolean(
      att.autoCheckedOut &&
      att.checkOutTime &&
      att.reactivatedAt &&
      att.autoCheckoutAt &&
      new Date(att.autoCheckoutAt) >= new Date(att.reactivatedAt)
    );

    const effectiveStatus = autoCheckedOutAfterReactivation
      ? (att.outOfBoundsReason ? 'pending' : 'none')
      : (att.reactivationStatus || 'none');

    return {
      _id: att._id,
      userId: att.userId,
      date: att.date,
      checkInTime: att.checkInTime,
      checkOutTime: att.checkOutTime,
      autoCheckoutAt: att.autoCheckoutAt || att.checkOutTime,
      status: att.status,
      autoCheckedOut: att.autoCheckedOut,
      autoCheckoutReason: att.autoCheckoutReason || 'PRESENCE_VALIDATION_FAILED',
      outOfBoundsReason: att.outOfBoundsReason,
      reactivationStatus: effectiveStatus,
      rawReactivationStatus: att.reactivationStatus || 'none',
      reactivationRequestedAt: att.reactivationRequestedAt,
      reactivationDecisionBy: att.reactivationDecisionBy,
      reactivationDecisionAt: att.reactivationDecisionAt,
      reactivationDecisionNotes: att.reactivationDecisionNotes,
      reactivatedAt: att.reactivatedAt,
      isCurrentlyActive,
      decisionStatus: effectiveStatus,
      autoCheckedOutAfterReactivation,
    };
  });

  const totalAutoCheckedOut = attendances.length;
  const pendingCount = records.filter((r) => r.reactivationStatus === 'pending').length;
  const approvedCount = records.filter((r) => r.reactivationStatus === 'approved' && r.isCurrentlyActive).length;
  const rejectedCount = records.filter((r) => r.reactivationStatus === 'rejected').length;

  return {
    date: targetDate,
    kpis: {
      totalAutoCheckedOut,
      pendingCount,
      approvedCount,
      rejectedCount,
    },
    records,
  };
};

/**
 * Approves and reactivates an auto-checked-out employee's session.
 * Enforces atomic state transitions, idempotent suspension break insertion,
 * and unified timestamp across all audit fields.
 */
const approveSessionReactivation = async ({ attendanceId, reviewerUser, notes = '', ipAddress = null }) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) {
    return { success: false, statusCode: 404, message: 'Attendance record not found' };
  }

  const now = new Date();
  const shiftEndLimit = new Date(`${attendance.date}T18:00:00.000+05:30`);
  if (now.getTime() >= shiftEndLimit.getTime()) {
    return {
      success: false,
      statusCode: 400,
      code: 'SHIFT_ENDED',
      message: 'Attendance sessions cannot be reactivated at or after 6:00 PM IST. The workday has concluded.',
    };
  }

  // If the session is already live and active:
  // Return idempotent success so the UI gracefully closes and transitions to Approved & Resumed
  if (attendance.status === 'present' && !attendance.checkOutTime) {
    if (attendance.reactivationStatus !== 'approved') {
      attendance.reactivationStatus = 'approved';
      attendance.reactivationDecisionBy = reviewerUser._id;
      attendance.reactivationDecisionAt = new Date();
      if (notes) attendance.reactivationDecisionNotes = notes;
    }
    attendance.heartbeatStatus = 'GRACE_PERIOD';
    attendance.heartbeatMonitoringGraceUntil = new Date(Date.now() + 30 * 60 * 1000);
    await attendance.save();
    return {
      success: true,
      statusCode: 200,
      code: 'ALREADY_ACTIVE',
      message: 'Session is already active and resumed.',
      attendance,
    };
  }

  // Single unified server timestamp for all approval mutations
  const reactivatedAt = new Date();
  const suspendedStart = attendance.autoCheckoutAt || attendance.checkOutTime || reactivatedAt;

  // Idempotent suspension break insertion
  if (!Array.isArray(attendance.breaks)) {
    attendance.breaks = [];
  }

  const existingSuspension = attendance.breaks.find(
    (b) =>
      b.type === 'suspension' &&
      b.startedAt &&
      Math.abs(new Date(b.startedAt).getTime() - new Date(suspendedStart).getTime()) < 2000
  );

  if (existingSuspension) {
    existingSuspension.endedAt = reactivatedAt;
  } else {
    attendance.breaks.push({
      type: 'suspension',
      startedAt: suspendedStart,
      endedAt: reactivatedAt,
    });
  }

  // Calculate attendance metrics using interval union (prevents double-counting lunch with suspension)
  const metrics = calcAttendanceMetrics({
    checkInTime: attendance.checkInTime,
    checkOutTime: null,
    breaks: attendance.breaks,
    referenceTime: reactivatedAt,
  });
  attendance.completedBreakMinutes = metrics.totalBreakMinutes;
  attendance.totalBreakMinutes = metrics.totalBreakMinutes;
  attendance.totalDurationMinutes = metrics.totalDurationMinutes;
  attendance.actualWorkMinutes = metrics.actualWorkMinutes;

  // Restore session state so work duration runs live until checkout!
  attendance.checkOutTime = null;
  attendance.status = 'present';
  attendance.autoCheckedOut = false;
  // Permanently preserve auto-close timestamp for full attendance audit trail
  attendance.autoCheckoutAt = suspendedStart;
  attendance.reactivationStatus = 'approved';
  attendance.reactivationDecisionBy = reviewerUser._id;
  attendance.reactivationDecisionAt = reactivatedAt;
  attendance.reactivatedAt = reactivatedAt;
  attendance.lastHeartbeatAt = reactivatedAt;
  attendance.heartbeatStatus = 'GRACE_PERIOD';
  attendance.heartbeatMonitoringGraceUntil = new Date(reactivatedAt.getTime() + 30 * 60 * 1000);
  attendance.currentWarningCount = 0;

  if (!Array.isArray(attendance.reactivationHistory)) {
    attendance.reactivationHistory = [];
  }
  attendance.reactivationHistory.push({
    autoCheckoutAt: suspendedStart,
    autoCheckoutReason: attendance.autoCheckoutReason || 'PRESENCE_VALIDATION_FAILED',
    employeeReason: attendance.outOfBoundsReason || null,
    requestedAt: attendance.reactivationRequestedAt || suspendedStart,
    decision: 'approved',
    decisionBy: reviewerUser._id,
    decisionAt: reactivatedAt,
    decisionNotes: notes || 'Approved by management',
    reactivatedAt,
  });

  await attendance.save();


  const userIdStr = attendance.userId.toString();

  // 1. Fast-path WebSocket notification
  emitToUser(userIdStr, 'attendance:reactivated', {
    attendanceId: attendance._id,
    reactivatedAt,
  });

  // 2. Persistent in-app notification
  await createNotification({
    userId: attendance.userId,
    type: 'session_reactivated',
    title: 'Session Reactivated',
    message: notes
      ? `Your session was reactivated by management: ${notes}`
      : 'Your attendance session has been approved and reactivated by management. You may resume work.',
    relatedId: attendance._id,
  });

  // 3. Immutable audit log
  await writeAuditLog({
    action: 'SESSION_REACTIVATED',
    performedBy: reviewerUser,
    targetCollection: 'Attendance',
    targetId: attendance._id,
    targetUserId: attendance.userId,
    reason: notes,
    metadata: {
      reactivatedAt,
      suspendedStart,
    },
    ipAddress,
  });

  return {
    success: true,
    statusCode: 200,
    message: 'Session approved and reactivated successfully',
    attendance,
  };
};

/**
 * Rejects a session reactivation request and permanently closes the session for today.
 */
const rejectSessionReactivation = async ({ attendanceId, reviewerUser, notes = '', ipAddress = null }) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) {
    return { success: false, statusCode: 404, message: 'Attendance record not found' };
  }

  const decisionAt = new Date();

  // If session is still open, close it out permanently
  if (!attendance.checkOutTime) {
    finalizeAttendanceCheckout(attendance, decisionAt);
  }
  attendance.status = 'incomplete';
  attendance.autoCheckedOut = true;
  attendance.reactivationStatus = 'rejected';
  attendance.reactivationDecisionBy = reviewerUser._id;
  attendance.reactivationDecisionAt = decisionAt;
  attendance.reactivationDecisionNotes = notes || null;

  if (!Array.isArray(attendance.reactivationHistory)) {
    attendance.reactivationHistory = [];
  }
  attendance.reactivationHistory.push({
    autoCheckoutAt: attendance.autoCheckoutAt || attendance.checkOutTime || decisionAt,
    autoCheckoutReason: attendance.autoCheckoutReason || 'PRESENCE_VALIDATION_FAILED',
    employeeReason: attendance.outOfBoundsReason || null,
    requestedAt: attendance.reactivationRequestedAt || decisionAt,
    decision: 'rejected',
    decisionBy: reviewerUser._id,
    decisionAt,
    decisionNotes: notes || 'Rejected by management',
    reactivatedAt: null,
  });

  await attendance.save();

  const userIdStr = attendance.userId.toString();

  // 1. Fast-path WebSocket notification
  emitToUser(userIdStr, 'attendance:reactivation_rejected', {
    attendanceId: attendance._id,
    reason: notes || 'Request rejected by management.',
  });

  // 2. Persistent in-app notification
  await createNotification({
    userId: attendance.userId,
    type: 'session_reactivation_rejected',
    title: 'Session Reactivation Rejected',
    message: notes
      ? `Your reactivation request was rejected: ${notes}. Your attendance session is closed for today.`
      : 'Your session reactivation request was rejected. Your attendance session is closed for today.',
    relatedId: attendance._id,
  });

  // 3. Immutable audit log
  await writeAuditLog({
    action: 'SESSION_REACTIVATION_REJECTED',
    performedBy: reviewerUser,
    targetCollection: 'Attendance',
    targetId: attendance._id,
    targetUserId: attendance.userId,
    reason: notes,
    metadata: {
      decisionAt,
    },
    ipAddress,
  });

  return {
    success: true,
    statusCode: 200,
    message: 'Session reactivation rejected successfully',
    attendance,
  };
};

module.exports = {
  getSessionReactivations,
  approveSessionReactivation,
  rejectSessionReactivation,
};

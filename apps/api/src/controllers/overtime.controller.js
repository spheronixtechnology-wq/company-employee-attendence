const mongoose = require('mongoose');
const Overtime = require('../models/Overtime');
const User = require('../models/User');
const { success, created, badRequest, notFound, forbidden, error } = require('../utils/response');
const { emitToManagers, emitToUser } = require('../socket');
const { createNotification } = require('../services/notification.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatMinutesToHours = (mins) => {
  if (!mins || mins <= 0) return '0h 00m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

// ── Employee Controllers ──────────────────────────────────────────────────────

/**
 * @desc Submit an Overtime Permission Request (Stage 1)
 * @route POST /api/employee/overtime/request
 */
const requestOvertime = async (req, res) => {
  try {
    const userId = req.user._id;
    const teamId = req.user.teamId || null;
    const { date, requestedStartTime, requestedEndTime, reason } = req.body;

    if (!date || !requestedStartTime || !requestedEndTime || !reason || !reason.trim()) {
      return badRequest(res, 'Please provide date, start time, end time, and reason for overtime.');
    }

    const start = new Date(requestedStartTime);
    const end = new Date(requestedEndTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return badRequest(res, 'Invalid requested start or end time format.');
    }

    if (end <= start) {
      return badRequest(res, 'Requested end time must be after start time.');
    }

    const expectedDurationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

    // Check for duplicate pending requests on the exact same window
    const existing = await Overtime.findOne({
      userId,
      date,
      status: { $in: ['permission_pending', 'permission_approved', 'in_progress', 'work_verification_pending'] },
    });

    if (existing) {
      return badRequest(
        res,
        `You already have an active or pending overtime request for ${date} (Status: ${existing.status.replace('_', ' ')}).`
      );
    }

    const overtime = await Overtime.create({
      userId,
      teamId,
      date,
      requestedStartTime: start,
      requestedEndTime: end,
      expectedDurationMinutes,
      reason: reason.trim(),
      permissionStatus: 'pending',
      workVerificationStatus: 'none',
      status: 'permission_pending',
    });

    // Notify managers via WebSocket and DB notification
    try {
      emitToManagers('overtime:request_created', {
        overtimeId: overtime._id,
        employeeName: req.user.name,
        date,
        expectedDurationMinutes,
      });

      const managers = await User.find({ role: { $in: ['manager', 'admin'] }, isActive: true }, '_id').lean();
      for (const m of managers) {
        await createNotification({
          userId: m._id,
          type: 'overtime_request',
          title: 'New Overtime Permission Request',
          message: `${req.user.name} requested ${formatMinutesToHours(expectedDurationMinutes)} OT on ${date}.`,
          relatedId: overtime._id,
        });
      }
    } catch (notifErr) {
      console.warn('Silent notification error on OT request:', notifErr.message);
    }

    return created(res, 'Overtime permission request submitted successfully. Awaiting manager approval.', {
      overtime,
    });
  } catch (err) {
    console.error('Error in requestOvertime:', err);
    return error(res, 'Failed to submit overtime request.', 500, err.message);
  }
};

/**
 * @desc Get current employee's overtime records and cumulative totals
 * @route GET /api/employee/overtime/me
 */
const getMyOvertime = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user's overtime records
    const records = await Overtime.find({ userId })
      .populate('permissionDecisionBy', 'name email')
      .populate('workVerifiedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Aggregates
    let totalApprovedMinutes = 0;
    let totalRecordedMinutes = 0;
    let pendingStage1Count = 0;
    let pendingStage2Count = 0;
    let activeSession = null;
    let permittedSession = null;

    for (const r of records) {
      if (r.status === 'completed_approved') {
        totalApprovedMinutes += Number(r.approvedMinutes || 0);
        if (r.recordedMinutes) {
          totalRecordedMinutes += Number(r.recordedMinutes || 0);
        }
      }
      if (r.status === 'permission_pending') {
        pendingStage1Count++;
      }
      if (r.status === 'work_verification_pending') {
        pendingStage2Count++;
      }
      if (r.status === 'in_progress' && !activeSession) {
        activeSession = r;
      }
      if (r.status === 'permission_approved' && !permittedSession) {
        permittedSession = r;
      }
    }

    return success(res, 'Overtime records retrieved successfully.', {
      records,
      stats: {
        totalApprovedMinutes,
        totalApprovedFormatted: formatMinutesToHours(totalApprovedMinutes),
        totalRecordedMinutes,
        totalRecordedFormatted: formatMinutesToHours(totalRecordedMinutes),
        pendingStage1Count,
        pendingStage2Count,
        pendingTotal: pendingStage1Count + pendingStage2Count,
        activeSession,
        permittedSession,
      },
    });
  } catch (err) {
    console.error('Error in getMyOvertime:', err);
    return error(res, 'Failed to retrieve overtime records.', 500, err.message);
  }
};

/**
 * @desc Start an approved Overtime session (Employee)
 * @route POST /api/employee/overtime/:id/start
 */
const startOvertimeSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const session = await Overtime.findOne({ _id: id, userId });
    if (!session) {
      return notFound(res, 'Overtime request not found.');
    }

    // STRICT GUARD: Must be Stage 1 permission_approved
    if (session.status !== 'permission_approved') {
      return badRequest(
        res,
        `Cannot start overtime. Current status is '${session.status.replace('_', ' ')}'. Overtime permission must be approved by your manager first.`
      );
    }

    // Check if there is already another in-progress OT session
    const ongoing = await Overtime.findOne({ userId, status: 'in_progress' });
    if (ongoing) {
      return badRequest(res, 'You already have an active Overtime session in progress.');
    }

    session.actualStartTime = new Date();
    session.status = 'in_progress';
    await session.save();

    emitToManagers('overtime:session_started', {
      overtimeId: session._id,
      employeeName: req.user.name,
      actualStartTime: session.actualStartTime,
    });

    return success(res, 'Overtime session started. Your working time is now being tracked.', { session });
  } catch (err) {
    console.error('Error in startOvertimeSession:', err);
    return error(res, 'Failed to start overtime session.', 500, err.message);
  }
};

/**
 * @desc Finish Overtime session and submit work verification (Employee)
 * @route POST /api/employee/overtime/:id/end
 */
const endOvertimeSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { workDetails } = req.body;

    const session = await Overtime.findOne({ _id: id, userId });
    if (!session) {
      return notFound(res, 'Overtime session not found.');
    }

    if (session.status !== 'in_progress') {
      return badRequest(res, `Cannot finish overtime. Session is not in progress (Current status: ${session.status}).`);
    }

    if (!workDetails || !workDetails.trim()) {
      return badRequest(res, 'Please provide details of the work performed during this overtime session.');
    }

    const endTime = new Date();
    const startTime = new Date(session.actualStartTime || session.requestedStartTime);
    const recordedMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

    session.actualEndTime = endTime;
    session.recordedMinutes = recordedMinutes;
    session.workDetails = workDetails.trim();
    session.workSubmittedAt = new Date();
    session.workVerificationStatus = 'pending';
    session.status = 'work_verification_pending';
    await session.save();

    // Notify managers that work is submitted for verification
    try {
      emitToManagers('overtime:work_submitted', {
        overtimeId: session._id,
        employeeName: req.user.name,
        recordedMinutes,
        workDetails: session.workDetails,
      });

      const managers = await User.find({ role: { $in: ['manager', 'admin'] }, isActive: true }, '_id').lean();
      for (const m of managers) {
        await createNotification({
          userId: m._id,
          type: 'overtime_work_verification',
          title: 'Overtime Work Awaiting Verification',
          message: `${req.user.name} finished ${formatMinutesToHours(recordedMinutes)} OT and submitted work details for review.`,
          relatedId: session._id,
        });
      }
    } catch (notifErr) {
      console.warn('Silent notification error on OT work submission:', notifErr.message);
    }

    return success(res, 'Overtime session ended and work details submitted for manager verification.', { session });
  } catch (err) {
    console.error('Error in endOvertimeSession:', err);
    return error(res, 'Failed to finish overtime session.', 500, err.message);
  }
};

/**
 * @desc Cancel a pending or approved Overtime request before session begins
 * @route POST /api/employee/overtime/:id/cancel
 */
const cancelOvertimeRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const session = await Overtime.findOne({ _id: id, userId });
    if (!session) {
      return notFound(res, 'Overtime request not found.');
    }

    if (!['permission_pending', 'permission_approved'].includes(session.status)) {
      return badRequest(res, `Cannot cancel overtime in status '${session.status}'. Only unstarted requests can be cancelled.`);
    }

    session.status = 'cancelled';
    await session.save();

    return success(res, 'Overtime request cancelled.', { session });
  } catch (err) {
    console.error('Error in cancelOvertimeRequest:', err);
    return error(res, 'Failed to cancel overtime request.', 500, err.message);
  }
};

// ── Manager Controllers ───────────────────────────────────────────────────────

/**
 * @desc Get Team Overtime requests and metrics (Manager)
 * @route GET /api/manager/team/overtime
 */
const getTeamOvertime = async (req, res) => {
  try {
    const manager = req.user;
    const filter = {};

    // Filter by team if manager is bound to a team
    if (manager.teamId) {
      filter.teamId = manager.teamId;
    }

    // Optional stage filter
    const { stage } = req.query;
    if (stage === 'permission_pending') {
      filter.status = 'permission_pending';
    } else if (stage === 'work_verification_pending') {
      filter.status = 'work_verification_pending';
    } else if (stage === 'history') {
      filter.status = { $in: ['completed_approved', 'completed_rejected', 'permission_rejected', 'cancelled'] };
    }

    const records = await Overtime.find(filter)
      .populate('userId', 'name email designation avatarUrl teamId')
      .populate('permissionDecisionBy', 'name email')
      .populate('workVerifiedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Compute manager-level summary metrics across the whole team
    const allTeamFilter = manager.teamId ? { teamId: manager.teamId } : {};
    const allRecords = await Overtime.find(allTeamFilter)
      .populate('userId', 'name email designation avatarUrl')
      .lean();

    let pendingPermissionsCount = 0;
    let pendingWorkVerificationsCount = 0;
    let activeSessionsCount = 0;
    let teamApprovedMinutes = 0;
    let teamRecordedMinutes = 0;

    // Per-member summary map
    const memberMap = new Map();

    for (const r of allRecords) {
      if (r.status === 'permission_pending') pendingPermissionsCount++;
      if (r.status === 'work_verification_pending') pendingWorkVerificationsCount++;
      if (r.status === 'in_progress') activeSessionsCount++;

      if (r.status === 'completed_approved') {
        teamApprovedMinutes += Number(r.approvedMinutes || 0);
      }
      if (r.recordedMinutes) {
        teamRecordedMinutes += Number(r.recordedMinutes || 0);
      }

      const uId = r.userId?._id?.toString() || r.userId?.toString();
      if (uId && r.userId?.name) {
        if (!memberMap.has(uId)) {
          memberMap.set(uId, {
            user: r.userId,
            approvedMinutes: 0,
            recordedMinutes: 0,
            completedSessions: 0,
            pendingSessions: 0,
          });
        }
        const mObj = memberMap.get(uId);
        if (r.status === 'completed_approved') {
          mObj.approvedMinutes += Number(r.approvedMinutes || 0);
          mObj.completedSessions++;
        }
        if (r.recordedMinutes) {
          mObj.recordedMinutes += Number(r.recordedMinutes || 0);
        }
        if (['permission_pending', 'work_verification_pending'].includes(r.status)) {
          mObj.pendingSessions++;
        }
      }
    }

    const teamMembers = Array.from(memberMap.values()).map((m) => ({
      ...m,
      approvedFormatted: formatMinutesToHours(m.approvedMinutes),
      recordedFormatted: formatMinutesToHours(m.recordedMinutes),
    }));

    return success(res, 'Team overtime retrieved successfully.', {
      records,
      stats: {
        pendingPermissionsCount,
        pendingWorkVerificationsCount,
        activeSessionsCount,
        teamApprovedMinutes,
        teamApprovedFormatted: formatMinutesToHours(teamApprovedMinutes),
        teamRecordedMinutes,
        teamRecordedFormatted: formatMinutesToHours(teamRecordedMinutes),
        teamMembers,
      },
    });
  } catch (err) {
    console.error('Error in getTeamOvertime:', err);
    return error(res, 'Failed to retrieve team overtime.', 500, err.message);
  }
};

/**
 * @desc Stage 1 Decision: Approve or Deny Overtime Permission (Manager)
 * @route POST /api/manager/team/overtime/:id/permission-decision
 */
const handlePermissionDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, "Action must be either 'approve' or 'reject'.");
    }

    const session = await Overtime.findById(id).populate('userId', 'name email');
    if (!session) {
      return notFound(res, 'Overtime request not found.');
    }

    if (session.status !== 'permission_pending') {
      return badRequest(
        res,
        `Cannot decide on this request. Current status is already '${session.status.replace('_', ' ')}'.`
      );
    }

    session.permissionDecisionBy = req.user._id;
    session.permissionDecisionAt = new Date();
    session.permissionNote = note ? note.trim() : null;

    if (action === 'approve') {
      session.permissionStatus = 'approved';
      session.status = 'permission_approved';
    } else {
      session.permissionStatus = 'rejected';
      session.status = 'permission_rejected';
    }

    await session.save();

    // Notify employee
    try {
      emitToUser(session.userId._id.toString(), 'overtime:permission_resolved', {
        overtimeId: session._id,
        action,
        status: session.status,
        note: session.permissionNote,
      });

      await createNotification({
        userId: session.userId._id,
        type: 'overtime_permission_decision',
        title: action === 'approve' ? 'Overtime Permission Approved ✅' : 'Overtime Permission Denied ❌',
        message: action === 'approve'
          ? `Your manager approved your OT permission for ${session.date}. You can now start the session when ready.`
          : `Your manager denied your OT permission request for ${session.date}.${session.permissionNote ? ` Reason: ${session.permissionNote}` : ''}`,
        relatedId: session._id,
      });
    } catch (notifErr) {
      console.warn('Silent notification error on permission decision:', notifErr.message);
    }

    return success(res, `Overtime permission ${action}d successfully.`, { session });
  } catch (err) {
    console.error('Error in handlePermissionDecision:', err);
    return error(res, 'Failed to resolve overtime permission.', 500, err.message);
  }
};

/**
 * @desc Stage 2 Decision: Verify & Approve or Reject Submitted Overtime Work (Manager)
 * @route POST /api/manager/team/overtime/:id/work-decision
 */
const handleWorkVerificationDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, approvedMinutes, note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, "Action must be either 'approve' or 'reject'.");
    }

    const session = await Overtime.findById(id).populate('userId', 'name email');
    if (!session) {
      return notFound(res, 'Overtime session not found.');
    }

    if (session.status !== 'work_verification_pending') {
      return badRequest(
        res,
        `Cannot verify work. Current status is '${session.status.replace('_', ' ')}' (expected 'work verification pending').`
      );
    }

    session.workVerifiedBy = req.user._id;
    session.workVerifiedAt = new Date();
    session.workVerificationNote = note ? note.trim() : null;

    if (action === 'reject') {
      // Rejection: 0 approved minutes, not added to total
      session.status = 'completed_rejected';
      session.workVerificationStatus = 'rejected';
      session.approvedMinutes = 0;
    } else {
      // Approval: Authoritative backend validation
      // 0 <= approvedMinutes <= session.recordedMinutes
      const requestedMins = approvedMinutes !== undefined ? Number(approvedMinutes) : session.recordedMinutes;

      if (isNaN(requestedMins) || requestedMins < 0 || requestedMins > session.recordedMinutes) {
        return badRequest(
          res,
          `Approved OT minutes (${requestedMins}) must be between 0 and recorded duration (${session.recordedMinutes} mins). Approved minutes cannot exceed recorded time.`
        );
      }

      session.approvedMinutes = requestedMins;
      session.status = 'completed_approved';
      session.workVerificationStatus = 'approved';
    }

    await session.save();

    // Notify employee
    try {
      emitToUser(session.userId._id.toString(), 'overtime:work_resolved', {
        overtimeId: session._id,
        action,
        status: session.status,
        approvedMinutes: session.approvedMinutes,
        note: session.workVerificationNote,
      });

      await createNotification({
        userId: session.userId._id,
        type: 'overtime_work_decision',
        title: action === 'approve' ? 'Overtime Work Approved ✅' : 'Overtime Work Rejected ❌',
        message: action === 'approve'
          ? `Your manager approved ${formatMinutesToHours(session.approvedMinutes)} of Overtime for ${session.date}. Time has been added to your approved OT total.`
          : `Your manager rejected the submitted OT work for ${session.date}. This time has NOT been added to your approved total.${session.workVerificationNote ? ` Reason: ${session.workVerificationNote}` : ''}`,
        relatedId: session._id,
      });
    } catch (notifErr) {
      console.warn('Silent notification error on work decision:', notifErr.message);
    }

    return success(
      res,
      action === 'approve'
        ? `Overtime work approved (${formatMinutesToHours(session.approvedMinutes)} added to employee record).`
        : 'Overtime work rejected (0 minutes added to approved total).',
      { session }
    );
  } catch (err) {
    console.error('Error in handleWorkVerificationDecision:', err);
    return error(res, 'Failed to resolve overtime work verification.', 500, err.message);
  }
};

// ── Admin Controllers ─────────────────────────────────────────────────────────

/**
 * @desc Company-wide Overtime records and analytics (Admin)
 * @route GET /api/admin/overtime
 */
const getAllCompanyOvertime = async (req, res) => {
  try {
    const records = await Overtime.find({})
      .populate('userId', 'name email designation avatarUrl teamId')
      .populate('teamId', 'name')
      .populate('permissionDecisionBy', 'name email')
      .populate('workVerifiedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    let totalApprovedMinutes = 0;
    let totalRecordedMinutes = 0;
    let pendingStage1Count = 0;
    let pendingStage2Count = 0;

    for (const r of records) {
      if (r.status === 'completed_approved') {
        totalApprovedMinutes += Number(r.approvedMinutes || 0);
        if (r.recordedMinutes) totalRecordedMinutes += Number(r.recordedMinutes || 0);
      }
      if (r.status === 'permission_pending') pendingStage1Count++;
      if (r.status === 'work_verification_pending') pendingStage2Count++;
    }

    return success(res, 'Company overtime records retrieved successfully.', {
      records,
      stats: {
        totalRecords: records.length,
        totalApprovedMinutes,
        totalApprovedFormatted: formatMinutesToHours(totalApprovedMinutes),
        totalRecordedMinutes,
        totalRecordedFormatted: formatMinutesToHours(totalRecordedMinutes),
        pendingStage1Count,
        pendingStage2Count,
      },
    });
  } catch (err) {
    console.error('Error in getAllCompanyOvertime:', err);
    return error(res, 'Failed to retrieve company overtime.', 500, err.message);
  }
};

module.exports = {
  requestOvertime,
  getMyOvertime,
  startOvertimeSession,
  endOvertimeSession,
  cancelOvertimeRequest,
  getTeamOvertime,
  handlePermissionDecision,
  handleWorkVerificationDecision,
  getAllCompanyOvertime,
};

/**
 * ExamDutyConflictService
 * Single source of truth for all exam duty conflict detection.
 * Used by: examDuty.controller.js (manual creation) and ExamDutyImportService (Excel import).
 */
const ExamDutyAssignment = require('../models/ExamDutyAssignment');
const LeaveRequest = require('../models/LeaveRequest');

/**
 * Finds conflicts for a list of userIds within a given time window.
 * Checks both existing ExamDuty overlaps and approved Leaves.
 *
 * @param {string[]} userIds   - Array of user ObjectId strings
 * @param {Date|string} startTime - Start of the duty window
 * @param {Date|string} endTime   - End of the duty window
 * @param {string[]} [excludeAssignmentIds=[]] - Assignment IDs to exclude (for reassign use-case)
 * @returns {Promise<ConflictResult[]>}
 */
const findConflicts = async (userIds, startTime, endTime, excludeAssignmentIds = []) => {
  const conflicts = [];
  const reqStart = new Date(startTime);
  const reqEnd   = new Date(endTime);

  // 1. Check existing ExamDuty assignments that overlap the time window
  const query = {
    userId: { $in: userIds },
    status: { $in: ['PENDING', 'ACCEPTED'] }
  };
  if (excludeAssignmentIds.length > 0) {
    query._id = { $nin: excludeAssignmentIds };
  }

  const activeAssignments = await ExamDutyAssignment.find(query).populate({
    path: 'examDutyId',
    match: {
      status: { $nin: ['CANCELLED', 'COMPLETED'] },
      startTime: { $lt: reqEnd },   // duty starts before our window ends
      endTime:   { $gt: reqStart }  // duty ends after our window starts → overlap
    }
  });

  for (const assignment of activeAssignments) {
    // populate match returns null if ExamDuty did not satisfy conditions
    if (!assignment.examDutyId) continue;
    const duty = assignment.examDutyId;

    conflicts.push({
      userId: assignment.userId.toString(),
      type: 'EXAM_DUTY',
      reason: `Already assigned to "${duty.examName}" (${duty.session}) on ${new Date(duty.date).toLocaleDateString()}`,
      assignmentId: assignment._id
    });
  }

  // 2. Check approved leaves scoped to the same date
  const reqDateStr = reqStart.toISOString().split('T')[0];
  const leaves = await LeaveRequest.find({
    userId: { $in: userIds },
    status: 'approved',
    startDate: { $lte: new Date(reqDateStr) },
    endDate:   { $gte: new Date(reqDateStr) }
  });

  for (const leave of leaves) {
    conflicts.push({
      userId: leave.userId.toString(),
      type: 'LEAVE',
      reason: `On Approved Leave (${leave.leaveType})`
    });
  }

  return conflicts;
};

module.exports = { findConflicts };

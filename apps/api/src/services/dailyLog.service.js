const DailyLog = require('../models/DailyLog');
const Attendance = require('../models/Attendance');
const { writeAuditLog } = require('./audit.service');
const { getTodayDateString } = require('../utils/dateUtils');
const { AUDIT_ACTIONS } = require('../../../../packages/shared/auditActions');
const { getFileUrl } = require('./upload.service');

/**
 * Submit or update a daily log.
 * Business rules validated per team type.
 */
const submitDailyLog = async ({ user, logData, file }) => {
  const today = getTodayDateString();
  const teamName = user.teamId?.name?.toLowerCase() || '';

  // Validate required fields per team
  if (teamName.includes('technical')) {
    if (!logData.taskTitle) throw { statusCode: 400, message: 'Task title is required for Technical team.' };
    if (!logData.projectName) throw { statusCode: 400, message: 'Project name is required for Technical team.' };
  } else if (teamName.includes('marketing')) {
    if (!logData.campaignName) throw { statusCode: 400, message: 'Campaign name is required for Marketing team.' };
    if (!logData.platform) throw { statusCode: 400, message: 'Platform is required for Marketing team.' };
  }

  const attachmentUrl = file ? getFileUrl(file.filename) : null;

  const log = await DailyLog.findOneAndUpdate(
    { userId: user._id, logDate: today },
    {
      $set: {
        teamId: user.teamId?._id,
        logDate: today,
        hoursSpent: logData.hoursSpent,
        // Technical fields
        taskTitle: logData.taskTitle || null,
        projectName: logData.projectName || null,
        ticketId: logData.ticketId || null,
        blockers: logData.blockers || null,
        // Marketing fields
        campaignName: logData.campaignName || null,
        platform: logData.platform || null,
        outputSummary: logData.outputSummary || null,
        // Common
        attachmentUrl: attachmentUrl || undefined,
        status: 'submitted',
        submittedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update attendance dailyLogSubmitted cache
  await Attendance.updateOne(
    { userId: user._id, date: today },
    { $set: { dailyLogSubmitted: true } }
  );

  return log;
};

/**
 * Admin/Manager override — marks daily log as overridden to unblock check-out.
 */
const overrideDailyLogLock = async ({ attendanceId, overriddenBy, reason }) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw { statusCode: 404, message: 'Attendance record not found.' };

  attendance.dailyLogSubmitted = true;
  attendance.overrideHistory.push({
    overriddenBy: overriddenBy._id,
    overriddenByRole: overriddenBy.role,
    type: 'daily_log_lock_override',
    reason,
    overriddenAt: new Date(),
  });
  await attendance.save();

  await writeAuditLog({
    action: AUDIT_ACTIONS.DAILY_LOG_LOCK_OVERRIDE,
    performedBy: overriddenBy,
    targetCollection: 'attendance',
    targetId: attendance._id,
    targetUserId: attendance.userId,
    reason,
  });

  return attendance;
};

/**
 * Get daily log streak — consecutive days of daily log submission for a user.
 */
const getDailyLogStreak = async (userId) => {
  const logs = await DailyLog.find({ userId }).sort({ logDate: -1 }).limit(60);

  let streak = 0;
  const today = getTodayDateString();
  let currentDate = new Date(today);

  for (let i = 0; i < logs.length; i++) {
    const logDate = logs[i].logDate;
    const expectedDate = currentDate.toISOString().split('T')[0];

    if (logDate === expectedDate) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
};

module.exports = { submitDailyLog, overrideDailyLogLock, getDailyLogStreak };

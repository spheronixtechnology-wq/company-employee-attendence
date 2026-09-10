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
const GITHUB_URL_REGEX = /^(https?:\/\/)?(www\.)?(github\.com\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*|gist\.github\.com\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*)\/?$/i;

const isValidGitHubUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!GITHUB_URL_REGEX.test(trimmed)) return false;
  try {
    const fullUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'github.com' && host !== 'gist.github.com') return false;
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return pathParts.length >= 1;
  } catch {
    return false;
  }
};

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
};

/**
 * Submit or update a daily log.
 * Unified fields required: taskTitle, projectName, description.
 * Optional: githubLink (validated), researchLinks (multiple URLs).
 */
const submitDailyLog = async ({ user, logData, file }) => {
  const today = getTodayDateString();

  // Validate required unified fields
  const taskTitle = (logData.taskTitle || '').trim();
  const projectName = (logData.projectName || '').trim();
  const description = (logData.description || '').trim();

  if (!taskTitle) {
    throw { statusCode: 400, message: 'Task Title is required.' };
  }
  if (!projectName) {
    throw { statusCode: 400, message: 'Project Name is required.' };
  }
  if (!description) {
    throw { statusCode: 400, message: 'Description is required.' };
  }

  // Validate GitHub link if provided
  let normalizedGithubLink = null;
  if (logData.githubLink && logData.githubLink.trim()) {
    const rawGh = logData.githubLink.trim();
    if (!isValidGitHubUrl(rawGh)) {
      throw {
        statusCode: 400,
        message: 'Invalid GitHub URL. Please provide a valid GitHub link (e.g., https://github.com/owner/repository).',
      };
    }
    normalizedGithubLink = normalizeUrl(rawGh);
  }

  // Process research links (array of strings)
  let cleanedResearchLinks = [];
  if (Array.isArray(logData.researchLinks)) {
    cleanedResearchLinks = logData.researchLinks;
  } else if (typeof logData.researchLinks === 'string') {
    try {
      const parsed = JSON.parse(logData.researchLinks);
      if (Array.isArray(parsed)) cleanedResearchLinks = parsed;
      else cleanedResearchLinks = [logData.researchLinks];
    } catch {
      cleanedResearchLinks = logData.researchLinks.split('\n');
    }
  }

  cleanedResearchLinks = cleanedResearchLinks
    .map((link) => (typeof link === 'string' ? link.trim() : ''))
    .filter(Boolean)
    .map((link) => normalizeUrl(link));

  const attachmentUrl = file ? getFileUrl(file.filename) : null;

  const log = await DailyLog.findOneAndUpdate(
    { userId: user._id, logDate: today },
    {
      $set: {
        teamId: user.teamId?._id || user.teamId,
        logDate: today,
        hoursSpent: logData.hoursSpent,
        // Unified fields
        taskTitle,
        projectName,
        description,
        githubLink: normalizedGithubLink,
        researchLinks: cleanedResearchLinks,
        // Legacy fields retained for backwards compatibility
        ticketId: logData.ticketId || null,
        blockers: logData.blockers || null,
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

/**
 * Automatically creates or closes an incomplete DailyLog at midnight.
 * Fills all missing required fields with "N/A" and computes hoursSpent from attendance.
 *
 * @param {Object} params
 * @param {Object} params.user - User document or object with _id and teamId
 * @param {Object} params.attendance - Attendance document
 * @param {string} params.logDate - 'YYYY-MM-DD'
 * @returns {Promise<Object>} Saved DailyLog document
 */
const autoSubmitMissingDailyLog = async ({ user, attendance, logDate }) => {
  const Team = require('../models/Team');

  let teamId = user.teamId?._id || user.teamId;
  let teamObj = user.teamId && user.teamId.name ? user.teamId : null;

  if (!teamObj && teamId) {
    teamObj = await Team.findById(teamId).lean();
  }

  // Fallback if user has no team assigned
  if (!teamId) {
    const defaultTeam = await Team.findOne({ isActive: { $ne: false } }).lean();
    if (defaultTeam) {
      teamId = defaultTeam._id;
      teamObj = defaultTeam;
    }
  }

  // Calculate hoursSpent from attendance net actualWorkMinutes (min 0.5, max 24)
  const workMins = attendance.actualWorkMinutes || attendance.totalDurationMinutes || 0;
  const computedHours = Math.max(0.5, Math.min(24, Math.round((workMins / 60) * 10) / 10));

  // Check if a partial or draft daily log already exists for this date
  const existingLog = await DailyLog.findOne({ userId: user._id, logDate });

  const updateFields = {
    userId: user._id,
    teamId,
    logDate,
    hoursSpent: existingLog?.hoursSpent || computedHours,
    // Unified fields
    taskTitle: existingLog?.taskTitle || 'N/A - Auto-closed on midnight checkout',
    projectName: existingLog?.projectName || 'N/A',
    description: existingLog?.description || 'N/A - Employee did not submit daily log before midnight',
    githubLink: existingLog?.githubLink || null,
    researchLinks: existingLog?.researchLinks || [],
    // Legacy fields
    ticketId: existingLog?.ticketId || 'N/A',
    blockers: existingLog?.blockers || 'N/A',
    campaignName: existingLog?.campaignName || 'N/A',
    platform: existingLog?.platform || 'N/A',
    outputSummary: existingLog?.outputSummary || 'N/A - Employee did not submit daily log before midnight',
    status: 'submitted',
    submittedAt: existingLog?.submittedAt || new Date(),
  };

  const log = await DailyLog.findOneAndUpdate(
    { userId: user._id, logDate },
    { $set: updateFields },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update attendance cache
  await Attendance.updateOne(
    { userId: user._id, date: logDate },
    { $set: { dailyLogSubmitted: true } }
  );

  return log;
};

module.exports = { submitDailyLog, overrideDailyLogLock, getDailyLogStreak, autoSubmitMissingDailyLog };

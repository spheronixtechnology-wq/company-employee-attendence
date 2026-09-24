const DailyLog = require('../models/DailyLog');
const Attendance = require('../models/Attendance');
const { writeAuditLog } = require('./audit.service');
const { getTodayDateString } = require('../utils/dateUtils');
const { getFileUrl } = require('./upload.service');
const storageService = require('./storage/storageService');

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

  let documentUrl = null;
  let documentName = null;
  let documentSize = null;
  let documentMimeType = null;
  let doctype = null;
  let document = null;
  let uploadResultKey = null;

  if (file) {
    documentName = file.originalname;
    documentSize = file.size;
    documentMimeType = file.mimetype || 'application/octet-stream';
    const extMatch = (file.originalname || '').split('.').pop();
    doctype = extMatch ? extMatch.toLowerCase() : 'doc';

    if (file.buffer) {
      // Phase 3: Upload directly to cloud storage (Supabase) instead of Base64
      const uniqueId = Math.random().toString(36).substring(2, 10);
      const safeName = documentName.replace(/[^a-zA-Z0-9.\-]/g, '_');
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      const storageKey = `daily-logs/${user._id}/${year}/${month}/${day}/${uniqueId}-${safeName}`;
      
      try {
        uploadResultKey = await storageService.uploadFile(file.buffer, storageKey, documentMimeType);
        
        document = {
          storageProvider: 'supabase',
          storageKey: uploadResultKey,
          fileName: documentName,
          mimeType: documentMimeType,
          fileSize: documentSize
        };
      } catch (err) {
        throw { statusCode: 500, message: 'Failed to upload document to storage provider.' };
      }
    } else if (file.filename) {
      documentUrl = getFileUrl(file.filename, 'daily-logs');
    }
  }

  // Check if an existing log for today already has a document
  const existingTodayLog = await DailyLog.findOne({ userId: user._id, logDate: today });
  if (!documentUrl && existingTodayLog?.documentUrl) {
    documentUrl = existingTodayLog.documentUrl;
    documentName = existingTodayLog.documentName;
    documentSize = existingTodayLog.documentSize;
    documentMimeType = existingTodayLog.documentMimeType;
    doctype = existingTodayLog.doctype;
  }

  // Validate that either a document was uploaded, or previously uploaded
  if (!documentUrl && !document && !file) {
    if (uploadResultKey) await storageService.deleteFile(uploadResultKey).catch(() => {});
    throw { statusCode: 400, message: 'Please upload a daily work document (within 2MB).' };
  }

  // Unified fields: provide friendly defaults if omitted
  const taskTitle = (logData.taskTitle || documentName || 'Daily Work Document').trim();
  const projectName = (logData.projectName || 'Daily Log').trim();
  const description = (logData.description || 'Submitted via daily work document upload.').trim();

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

  // Process research links (array of strings) if provided
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

  let log;
  try {
    log = await DailyLog.findOneAndUpdate(
      { userId: user._id, logDate: today },
      {
        $set: {
          teamId: user.teamId?._id || user.teamId,
          logDate: today,
          hoursSpent: logData.hoursSpent,
          // Phase 3 Document upload metadata
          document: document || undefined,
          // Base64 data link & metadata (Legacy fallback if existing)
          documentUrl: documentUrl || undefined,
          documentName: documentName || undefined,
          documentSize: documentSize || undefined,
          documentMimeType: documentMimeType || undefined,
          doctype: doctype || undefined,
          // Common / backward compatibility
          attachmentUrl: documentUrl || undefined,
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
          status: 'submitted',
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (uploadResultKey) await storageService.deleteFile(uploadResultKey).catch(() => {});
    throw err;
  }

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
    action: 'DAILY_LOG_LOCK_OVERRIDE',
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

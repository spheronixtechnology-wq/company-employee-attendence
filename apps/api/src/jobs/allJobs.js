const cron = require('node-cron');
const { cleanupExpiredTemporaryAccess } = require('../services/cleanup.service');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const User = require('../models/User');
const { createBulkNotifications } = require('../services/notification.service');
const {
  getTodayDateString,
  getBusinessDateString,
  getBusinessEndOfDay,
  toDateString,
  finalizeAttendanceCheckout,
} = require('../utils/dateUtils');
const { autoSubmitMissingDailyLog } = require('../services/dailyLog.service');
const { writeAuditLog } = require('../services/audit.service');

/**
 * Job 1: Daily Log Reminder
 * Runs at 6:00 PM IST every day.
 * Notifies all checked-in employees who haven't submitted a daily log.
 */
const startDailyLogReminderJob = () => {
  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] Running daily log reminder check...');
    try {
      const today = getTodayDateString('Asia/Kolkata');

      // Find all employees who checked in today
      const checkedInAttendance = await Attendance.find({
        date: today,
        checkInTime: { $ne: null },
        checkOutTime: null, // Still checked in
      }).select('userId');

      const checkedInUserIds = checkedInAttendance.map((a) => a.userId);

      // Find users who already submitted
      const submittedUserIds = await DailyLog.find({ logDate: today }).distinct('userId');
      const submittedSet = new Set(submittedUserIds.map((id) => id.toString()));

      // Filter those missing logs
      const missingLogUserIds = checkedInUserIds.filter(
        (uid) => !submittedSet.has(uid.toString())
      );

      if (missingLogUserIds.length === 0) {
        console.log('[CRON] All checked-in employees have submitted daily logs.');
        return;
      }

      // Send notifications
      const notifications = missingLogUserIds.map((userId) => ({
        userId,
        type: 'daily_log_reminder',
        title: 'Daily Log Reminder',
        message: "Don't forget to submit your daily log before checking out today.",
        createdAt: new Date(),
        isRead: false,
      }));

      await createBulkNotifications(notifications);
      console.log(`[CRON] Sent daily log reminders to ${missingLogUserIds.length} employees.`);
    } catch (err) {
      console.error('[CRON] Daily log reminder failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ Daily log reminder job scheduled (daily at 6:00 PM IST)');
};

/**
 * Executes midnight auto-checkout and log completion for abandoned / incomplete sessions.
 * Strictly ignores employees who already checked out and submitted their logs.
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {Promise<{ processedCount: number, autoCheckedOutUsers: string[] }>}
 */
const runMidnightAutoCheckout = async (referenceDate = new Date()) => {
  console.log('[CRON] Running midnight auto-checkout & logsheet closure...');
  try {
    const currentIstDate = getBusinessDateString(referenceDate, 'Asia/Kolkata');
    // The concluded workday is yesterday relative to reference date in Asia/Kolkata
    const yesterdayMs = new Date(referenceDate).getTime() - 24 * 60 * 60 * 1000;
    const concludedWorkDate = getBusinessDateString(new Date(yesterdayMs), 'Asia/Kolkata');

    console.log(`[CRON] Current IST Date: ${currentIstDate} | Concluded Workday: ${concludedWorkDate}`);

    // Query incomplete attendance records (checked-in, no checkout, date <= concludedWorkDate)
    const incomplete = await Attendance.find({
      date: { $lte: concludedWorkDate },
      checkInTime: { $ne: null },
      checkOutTime: null,
    }).populate('userId');

    if (incomplete.length === 0) {
      console.log('[CRON] No incomplete attendance records to auto-checkout.');
      return { processedCount: 0, autoCheckedOutUsers: [] };
    }

    const autoCheckedOutUsers = [];

    for (const att of incomplete) {
      const user = att.userId;
      if (!user) continue;

      // 1. Determine end of workday in Asia/Kolkata (23:59:59.000 IST)
      const autoCheckOutTime = getBusinessEndOfDay(att.date);

      // 2. Reuse single-source checkout duration & break calculation
      finalizeAttendanceCheckout(att, autoCheckOutTime);
      att.status = 'incomplete';
      att.autoCheckedOut = true;
      att.autoCheckoutReason = 'MIDNIGHT_AUTO_CHECKOUT';
      await att.save();

      // 3. Auto-complete missing daily log with "N/A"
      await autoSubmitMissingDailyLog({
        user,
        attendance: att,
        logDate: att.date,
      });

      // 4. Invalidate user active session (forces clean login on next workday)
      await User.updateOne(
        { _id: user._id },
        { $inc: { tokenVersion: 1 } }
      );

      // 5. Audit log
      try {
        await writeAuditLog({
          action: 'MIDNIGHT_AUTO_CHECKOUT',
          performedBy: user,
          targetCollection: 'Attendance',
          targetId: att._id,
          targetUserId: user._id,
          metadata: {
            workDate: att.date,
            autoCheckOutTime,
            actualWorkMinutes: att.actualWorkMinutes,
          },
        });
      } catch (auditErr) {
        console.warn('[CRON] Audit log error for auto-checkout:', auditErr.message);
      }

      autoCheckedOutUsers.push(user.email || user.name || user._id.toString());
    }

    console.log(`[CRON] Auto-checked out ${incomplete.length} employee(s) at midnight:`, autoCheckedOutUsers);
    return { processedCount: incomplete.length, autoCheckedOutUsers };
  } catch (err) {
    console.error('[CRON] Midnight auto-checkout job failed:', err);
    throw err;
  }
};

/**
 * Job 2: Auto Checkout / Incomplete Day Marker
 * Runs at 12:00 AM IST every day.
 * Auto-closes abandoned sessions, submits missing logs with "N/A", and invalidates sessions.
 */
const startAutoCheckoutJob = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      await runMidnightAutoCheckout();
    } catch (err) {
      console.error('[CRON] Scheduled auto-checkout failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ Auto-checkout job scheduled (daily at 12:00 AM IST)');
};

/**
 * Job 3: Temporary Access Cleanup
 * Runs every hour to expire outdated device authorizations and location assignments.
 */
const startTemporaryAccessCleanupJob = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      await cleanupExpiredTemporaryAccess();
    } catch (err) {
      console.error('[CRON] Temporary access cleanup failed:', err.message);
    }
  });
  // Also run immediately on startup
  cleanupExpiredTemporaryAccess().catch((err) => console.error('[cleanup] Startup run error:', err.message));
  console.log('✅ Temporary access cleanup job scheduled (every hour)');
};

/**
 * Start all cron jobs.
 */
const initCronJobs = () => {
  startDailyLogReminderJob();
  startAutoCheckoutJob();
  startTemporaryAccessCleanupJob();
  console.log('✅ All cron jobs initialized.');
};

module.exports = {
  initCronJobs,
  startDailyLogReminderJob,
  startAutoCheckoutJob,
  runMidnightAutoCheckout,
  startTemporaryAccessCleanupJob,
};

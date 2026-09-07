const cron = require('node-cron');
const { cleanupExpiredTemporaryAccess } = require('../services/cleanup.service');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const User = require('../models/User');
const { createBulkNotifications } = require('../services/notification.service');
const { getTodayDateString, toDateString, finalizeAttendanceCheckout } = require('../utils/dateUtils');


/**
 * Job 2: Daily Log Reminder
 * Runs at 6:00 PM IST every day.
 * Notifies all checked-in employees who haven't submitted a daily log.
 */
const startDailyLogReminderJob = () => {
  cron.schedule('0 12 * * *', async () => {  // 12:00 UTC = 17:30 IST, close enough
    console.log('[CRON] Running daily log reminder check...');
    try {
      const today = getTodayDateString();

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
  }, { timezone: 'UTC' });

  console.log('✅ Daily log reminder job scheduled (daily at 6PM IST)');
};

/**
 * Job 3: Auto Checkout / Incomplete Day Marker
 * Runs at 11:59 PM IST every day.
 * Marks attendance as 'incomplete' for employees who didn't check out.
 */
const startAutoCheckoutJob = () => {
  cron.schedule('59 18 * * *', async () => {  // 18:29 UTC = 23:59 IST
    console.log('[CRON] Running auto-checkout / incomplete day marker...');
    try {
      const today = getTodayDateString();

      // Find attendance records with check-in but no check-out
      const incomplete = await Attendance.find({
        date: today,
        checkInTime: { $ne: null },
        checkOutTime: null,
      });

      for (const att of incomplete) {
        // Auto checkout at end of day and compute duration / break breakdown
        const autoCheckOutTime = new Date(`${today}T23:59:00.000Z`);
        finalizeAttendanceCheckout(att, autoCheckOutTime);
        att.status = 'incomplete';
        await att.save();
      }

      if (incomplete.length > 0) {
        console.log(`[CRON] Marked ${incomplete.length} attendance records as incomplete.`);
      }
    } catch (err) {
      console.error('[CRON] Auto-checkout job failed:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('✅ Auto-checkout job scheduled (daily at 11:59 PM IST)');
};

/**
 * Job 4: Temporary Access Cleanup
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
  cleanupExpiredTemporaryAccess().catch(err => console.error('[cleanup] Startup run error:', err.message));
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
  startTemporaryAccessCleanupJob,
};

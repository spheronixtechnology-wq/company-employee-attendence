const cron = require('node-cron');
const { cleanupExpiredTemporaryAccess } = require('../services/cleanup.service');
const Attendance = require('../models/Attendance');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const DailyLog = require('../models/DailyLog');
const User = require('../models/User');
const { createBulkNotifications } = require('../services/notification.service');
const {
  getTodayDateString,
  getBusinessDateString,
  getBusinessEndOfDay,
  toDateString,
  finalizeAttendanceCheckout,
  calcAttendanceStatus,
} = require('../utils/dateUtils');
const { autoSubmitMissingDailyLog } = require('../services/dailyLog.service');
const { writeAuditLog } = require('../services/audit.service');
const { emitToUser, emitToManagers, emitToTeam } = require('../socket');

/**
 * Executes 6:00 PM IST automatic checkout for all active accounts.
 * - Enforces shift end limit at 18:00:00.000+05:30.
 * - Finalizes checkout metrics via finalizeAttendanceCheckout.
 * - Marks status as present/half_day if daily log was submitted, or incomplete if log was omitted.
 * - Closes active breaks and sets autoCheckoutReason = 'SHIFT_END_AUTO_CHECKOUT'.
 * - Emits real-time checkout socket events to user and managers.
 */
const runShiftEndAutoCheckout = async (referenceDate = new Date()) => {
  try {
    const today = getTodayDateString('Asia/Kolkata');
    const shiftEndLimit = new Date(`${today}T18:00:00.000+05:30`);

    // Find all active attendance records for today (checked-in, no checkout yet)
    const activeSessions = await Attendance.find({
      date: today,
      checkInTime: { $ne: null },
      checkOutTime: null,
    }).populate('userId');

    if (activeSessions.length === 0) {
      return { processedCount: 0, autoCheckedOutUsers: [] };
    }

    console.log(`[CRON 6PM] Running automatic shift-end checkout for ${activeSessions.length} active sessions...`);
    const autoCheckedOutUsers = [];

    for (const att of activeSessions) {
      const user = att.userId;
      if (!user) continue;

      const checkoutTimestamp = shiftEndLimit;

      // 1. Auto-close any unended breaks & finalize metrics
      const metrics = finalizeAttendanceCheckout(att, checkoutTimestamp);

      // 2. Check if daily log was submitted for today
      const hasLog = await DailyLog.exists({ userId: user._id, logDate: today });
      att.dailyLogSubmitted = !!hasLog;

      // 3. Status determination: if log submitted -> present/half_day; if not -> incomplete
      if (hasLog) {
        att.status = calcAttendanceStatus(metrics.actualWorkMinutes);
      } else {
        att.status = 'incomplete';
      }

      att.autoCheckedOut = true;
      att.autoCheckoutReason = 'SHIFT_END_AUTO_CHECKOUT';
      att.autoCheckoutAt = checkoutTimestamp;
      att.reactivationStatus = null; // No reactivations allowed past 6 PM

      await att.save();
      autoCheckedOutUsers.push(user.email || user._id.toString());

      // 4. Real-time socket notification
      emitToUser(user._id.toString(), 'attendance:checked_out', {
        attendance: att,
        summary: {
          checkInTime: att.checkInTime,
          checkOutTime: att.checkOutTime,
          totalDurationMinutes: metrics.totalDurationMinutes,
          totalBreakMinutes: metrics.totalBreakMinutes,
          actualWorkMinutes: metrics.actualWorkMinutes,
          status: att.status,
          reason: 'SHIFT_END_AUTO_CHECKOUT',
        },
      });

      const teamId = user.teamId?._id || user.teamId;
      if (teamId) {
        emitToTeam(teamId, 'attendance:update', {
          type: 'check_out',
          userId: user._id,
          userName: user.name,
          teamId,
          attendance: att,
        });
      }
      emitToManagers('attendance:update', {
        type: 'check_out',
        userId: user._id,
        userName: user.name,
        teamId,
        attendance: att,
      });

      // 5. Audit log
      try {
        await writeAuditLog({
          action: 'SHIFT_END_AUTO_CHECKOUT',
          performedBy: user,
          targetCollection: 'Attendance',
          targetId: att._id,
          targetUserId: user._id,
          metadata: {
            workDate: today,
            autoCheckOutTime: checkoutTimestamp,
            actualWorkMinutes: metrics.actualWorkMinutes,
            totalBreakMinutes: metrics.totalBreakMinutes,
          },
        });
      } catch (auditErr) {
        console.error('[CRON 6PM] Audit log failed:', auditErr.message);
      }
    }

    console.log(`[CRON 6PM] Completed 6:00 PM auto-checkout for ${autoCheckedOutUsers.length} users.`);
    return { processedCount: autoCheckedOutUsers.length, autoCheckedOutUsers };
  } catch (err) {
    console.error('[CRON 6PM] Shift-end auto checkout failed:', err.message);
    return { processedCount: 0, autoCheckedOutUsers: [] };
  }
};

const startShiftEndAutoCheckoutJob = () => {
  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] 6:00 PM IST reached. Executing shift-end auto-checkout...');
    await runShiftEndAutoCheckout();
  }, { timezone: 'Asia/Kolkata' });
  console.log('✅ Shift-end auto-checkout job scheduled (daily at 6:00 PM IST)');
};

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
 * Job 4: Continuous Presence & Workstation Heartbeat Monitoring (Every Minute)
 * - Server-Authoritative: Checked against singleton AttendanceMethodSetting.
 * - If heartbeatMonitoringEnabled is false: Immediately exits. Zero auto-checkouts.
 * - If enabled: Evaluates active sessions against an epoch-aware baseline with lunch/break resets.
 * - Warns once at halfway point (4 minutes).
 * - Auto-checkouts at >= timeoutMinutes with reason HEARTBEAT_TIMEOUT.
 */
const startPresenceMonitoringJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      // 1. Live authoritative singleton query
      const activeSetting = await AttendanceMethodSetting.getActiveSetting();
      const isHeartbeatEnabled = activeSetting?.heartbeatMonitoringEnabled === true;

      // 2. Strict Gateway: If disabled by Manager, stop immediately (zero auto-checkouts, zero DB writes)
      if (!isHeartbeatEnabled) {
        return;
      }

      const today = getTodayDateString('Asia/Kolkata');
      const now = new Date();
      const currentHourIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(now);
      
      // Strict 6:00 PM cutoff: At or past 18:00 IST, all active accounts are automatically checked out
      if (parseInt(currentHourIst, 10) >= 18) {
        await runShiftEndAutoCheckout(now);
        return;
      }

      const activeSessions = await Attendance.find({
        date: today,
        checkInTime: { $ne: null },
        checkOutTime: null,
      }).populate('userId');

      if (!activeSessions || activeSessions.length === 0) {
        return;
      }

      const timeoutMinutes = activeSetting.heartbeatTimeoutMinutes || 8;
      const startedAtMs = activeSetting.heartbeatMonitoringStartedAt
        ? new Date(activeSetting.heartbeatMonitoringStartedAt).getTime()
        : now.getTime();

      const isLunchHour = parseInt(currentHourIst, 10) === 13;
      // Lunch window definition (13:00 to 14:00 IST today)
      const lunchEndMs = new Date(`${today}T14:00:00.000+05:30`).getTime();

      for (const att of activeSessions) {
        // A. Skip active breaks or active lunch hour
        const hasActiveBreak = att.breaks && att.breaks.some(b => !b.endedAt);
        if (hasActiveBreak || isLunchHour) {
          continue;
        }

        // B. Temporary reactivation grace window (bounded by heartbeatMonitoringGraceUntil)
        if (att.heartbeatMonitoringGraceUntil && now.getTime() < new Date(att.heartbeatMonitoringGraceUntil).getTime()) {
          if (att.heartbeatStatus !== 'GRACE_PERIOD') {
            att.heartbeatStatus = 'GRACE_PERIOD';
            await att.save();
          }
          continue;
        }

        // C. Epoch-Aware Heartbeat: Only heartbeats received at or after startedAtMs count
        const lastHeartbeatMs =
          att.lastHeartbeatAt && new Date(att.lastHeartbeatAt).getTime() >= startedAtMs
            ? new Date(att.lastHeartbeatAt).getTime()
            : 0;

        // D. Latest completed break end timestamp
        let latestBreakEndMs = 0;
        if (Array.isArray(att.breaks)) {
          for (const b of att.breaks) {
            if (b.endedAt) {
              const endMs = new Date(b.endedAt).getTime();
              if (endMs > latestBreakEndMs) latestBreakEndMs = endMs;
            }
          }
        }

        // E. Employee-Specific Lunch Baseline (only for sessions checked in before lunch ended)
        const checkInMs = att.checkInTime ? new Date(att.checkInTime).getTime() : 0;
        const wasSubjectToLunch = checkInMs > 0 && checkInMs < lunchEndMs && now.getTime() >= lunchEndMs;
        const lunchBaselineMs = wasSubjectToLunch ? lunchEndMs : 0;

        // F. Resilient Effective Baseline Calculation
        const effectiveBaselineMs = Math.max(
          lastHeartbeatMs,
          startedAtMs,
          checkInMs,
          latestBreakEndMs,
          lunchBaselineMs
        );

        const minutesSinceBaseline = (now.getTime() - effectiveBaselineMs) / 60000;

        // G. State: HEALTHY (< timeoutMinutes / 2)
        if (minutesSinceBaseline < (timeoutMinutes / 2)) {
          if (att.heartbeatStatus !== 'HEALTHY') {
            att.heartbeatStatus = 'HEALTHY';
            await att.save();
          }
          continue;
        }

        // H. State: WARNING (Emit once, prevent spam)
        if (minutesSinceBaseline >= (timeoutMinutes / 2) && minutesSinceBaseline < timeoutMinutes) {
          if (att.heartbeatStatus !== 'WARNING') {
            att.heartbeatStatus = 'WARNING';
            await att.save();
            if (att.userId?._id) {
              emitToUser(att.userId._id.toString(), 'attendance:heartbeat_warning', {
                minutesMissing: Math.floor(minutesSinceBaseline),
                timeoutMinutes,
              });
            }
          }
          continue;
        }

        // I. State: TIMED_OUT (>= timeoutMinutes)
        if (minutesSinceBaseline >= timeoutMinutes) {
          const autoCheckOutTime = new Date();
          finalizeAttendanceCheckout(att, autoCheckOutTime);
          att.status = 'incomplete';
          att.autoCheckedOut = true;
          att.autoCheckoutReason = 'HEARTBEAT_TIMEOUT';
          att.autoCheckoutAt = autoCheckOutTime;
          att.heartbeatStatus = 'TIMED_OUT';
          att.reactivationStatus = null;
          att.outOfBoundsReason = null;
          att.reactivationRequestedAt = null;
          att.reactivationDecisionBy = null;
          att.reactivationDecisionAt = null;
          att.reactivationDecisionNotes = null;
          att.reactivatedAt = null;
          att.heartbeatMonitoringGraceUntil = null;
          await att.save();

          console.log(`[CRON] Auto-checked out ${att.userId?.email || att.userId} due to HEARTBEAT_TIMEOUT (${Math.floor(minutesSinceBaseline)}m >= ${timeoutMinutes}m).`);

          await writeAuditLog({
            action: 'AUTO_CHECKOUT_HEARTBEAT_TIMEOUT',
            performedBy: null,
            targetCollection: 'Attendance',
            targetId: att._id,
            targetUserId: att.userId?._id || att.userId,
            metadata: {
              timeoutMinutes,
              minutesSinceBaseline: Math.floor(minutesSinceBaseline),
              lastHeartbeatAt: att.lastHeartbeatAt,
              startedAt: activeSetting.heartbeatMonitoringStartedAt,
            },
          });
        }
      }
    } catch (err) {
      console.error('[CRON] Presence monitoring failed:', err.message);
    }
  });
  console.log('✅ Presence monitoring job scheduled (every minute)');
};

/**
 * Start all cron jobs.
 */
const initCronJobs = () => {
  startDailyLogReminderJob();
  startShiftEndAutoCheckoutJob();
  startAutoCheckoutJob();
  startTemporaryAccessCleanupJob();
  startPresenceMonitoringJob();
  console.log('✅ All cron jobs initialized.');
};

module.exports = {
  initCronJobs,
  startDailyLogReminderJob,
  startShiftEndAutoCheckoutJob,
  runShiftEndAutoCheckout,
  startAutoCheckoutJob,
  runMidnightAutoCheckout,
  startTemporaryAccessCleanupJob,
  startPresenceMonitoringJob,
};

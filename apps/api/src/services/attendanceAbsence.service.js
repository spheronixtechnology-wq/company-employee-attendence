const Attendance = require('../models/Attendance');
const JobRunMarker = require('../models/JobRunMarker');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const { isNonWorkingDay } = require('../config/holidays');
const { getBusinessDateString, getBusinessEndOfDay } = require('../utils/dateUtils');

const ABSENT_JOB = 'daily_absent_marking';
const ABSENT_JOB_CUTOFF_IST = '18:30';

/**
 * A 0.5-day leave is only possible on a single-day request; multi-day leave counts 1 per day.
 */
const leaveFractionFor = (leave) =>
  leave.startDate === leave.endDate && leave.totalDays === 0.5 ? 0.5 : 1;

const isAbsentJobComplete = async (date) =>
  Boolean(await JobRunMarker.exists({ job: ABSENT_JOB, date }));

/**
 * Creates `absent` / `leave` rows for every eligible employee with no attendance row on `date`.
 * Existing rows are never modified: the upsert only inserts, and `timestamps: false` stops
 * Mongoose from bumping updatedAt on matched rows (which would re-emit them to integrations).
 * The completion marker is written only after the bulk write succeeds.
 *
 * @param {string} date 'YYYY-MM-DD'
 * @returns {Promise<{ date: string, skipped: boolean, reason?: string, processedCount: number, insertedCount: number }>}
 */
const runDailyAbsentMarking = async (date) => {
  const calendar = isNonWorkingDay(date);
  if (calendar.isNonWorkingDay) {
    return { date, skipped: true, reason: calendar.reason, processedCount: 0, insertedCount: 0 };
  }

  const [users, leaves] = await Promise.all([
    User.find({
      role: { $in: ['employee', 'manager'] },
      isActive: true,
      deletedAt: null,
      joinedDate: { $lte: getBusinessEndOfDay(date) },
    })
      .select('_id')
      .lean(),
    LeaveRequest.find({ status: 'approved', startDate: { $lte: date }, endDate: { $gte: date } })
      .populate('leaveTypeId', 'name')
      .lean(),
  ]);

  const leaveMap = new Map(leaves.map((l) => [String(l.userId), l]));
  const now = new Date();

  const ops = users.map((u) => {
    const leave = leaveMap.get(String(u._id));
    return {
      updateOne: {
        filter: { userId: u._id, date },
        update: {
          $setOnInsert: {
            userId: u._id,
            date,
            status: leave ? 'leave' : 'absent',
            checkInMethod: null,
            leaveRequestId: leave ? leave._id : null,
            leaveTypeName: leave?.leaveTypeId?.name || null,
            leaveFraction: leave ? leaveFractionFor(leave) : null,
            totalDurationMinutes: 0,
            totalBreakMinutes: 0,
            actualWorkMinutes: 0,
            dailyLogSubmitted: false,
            autoCheckedOut: false,
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
        timestamps: false,
      },
    };
  });

  let insertedCount = 0;
  if (ops.length > 0) {
    const result = await Attendance.bulkWrite(ops, { ordered: false });
    insertedCount = result.upsertedCount || 0;
  }

  await JobRunMarker.updateOne(
    { job: ABSENT_JOB, date },
    { $set: { completedAt: new Date(), processedCount: ops.length } },
    { upsert: true }
  );

  return { date, skipped: false, processedCount: ops.length, insertedCount };
};

const shiftDateString = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const getIstTimeHHMM = (referenceDate) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(referenceDate);

/**
 * Re-runs the absence job for recent working days that have no completion marker
 * (server asleep or down at 18:30), plus today if the cutoff has already passed.
 * ABSENT_MARKING_START_DATE (YYYY-MM-DD) prevents back-filling dates before go-live.
 *
 * @param {{ referenceDate?: Date, lookbackDays?: number }} [options]
 * @returns {Promise<string[]>} dates that were processed
 */
const catchUpMissedAbsentRuns = async ({ referenceDate = new Date(), lookbackDays = 7 } = {}) => {
  const today = getBusinessDateString(referenceDate, 'Asia/Kolkata');
  const startDate = process.env.ABSENT_MARKING_START_DATE || null;

  const candidates = [];
  for (let i = lookbackDays; i >= 1; i--) {
    candidates.push(shiftDateString(today, -i));
  }
  if (getIstTimeHHMM(referenceDate) >= ABSENT_JOB_CUTOFF_IST) {
    candidates.push(today);
  }

  const processed = [];
  for (const date of candidates) {
    if (startDate && date < startDate) continue;
    if (isNonWorkingDay(date).isNonWorkingDay) continue;
    if (await isAbsentJobComplete(date)) continue;
    await runDailyAbsentMarking(date);
    processed.push(date);
  }
  return processed;
};

module.exports = {
  ABSENT_JOB,
  ABSENT_JOB_CUTOFF_IST,
  leaveFractionFor,
  isAbsentJobComplete,
  runDailyAbsentMarking,
  catchUpMissedAbsentRuns,
};

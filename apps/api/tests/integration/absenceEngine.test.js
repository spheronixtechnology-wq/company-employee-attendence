const Attendance = require('../../src/models/Attendance');
const JobRunMarker = require('../../src/models/JobRunMarker');
const LeaveRequest = require('../../src/models/LeaveRequest');
const LeaveType = require('../../src/models/LeaveType');
const User = require('../../src/models/User');
const {
  ABSENT_JOB,
  runDailyAbsentMarking,
  catchUpMissedAbsentRuns,
} = require('../../src/services/attendanceAbsence.service');
const { makeLeaveDecision, overrideLeaveDecision } = require('../../src/services/leave.service');
const { submitDailyLog, autoSubmitMissingDailyLog } = require('../../src/services/dailyLog.service');
const { getTodayDateString } = require('../../src/utils/dateUtils');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

const WORKDAY = '2026-10-27'; // Tuesday
const PAST = new Date('2026-01-01T00:00:00Z');

const shift = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let counter = 0;
const makeUser = (overrides = {}) => {
  counter += 1;
  return User.create({
    name: `User ${counter}`,
    email: `user${counter}@spheronix.com`,
    passwordHash: 'Password@123',
    role: 'employee',
    isActive: true,
    joinedDate: PAST,
    ...overrides,
  });
};

const makeLeaveType = () => LeaveType.create({ name: 'Casual Leave', code: 'CL', annualQuota: 12 });

describe('EOD absence engine, leave sync and daily-log reactivity', () => {
  let admin;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearDatabase();
    delete process.env.ABSENT_MARKING_START_DATE;
    admin = await makeUser({ role: 'admin' });
  });

  describe('runDailyAbsentMarking', () => {
    it('marks unpunched employees absent, leaves punched rows untouched and skips ineligible users', async () => {
      const present = await makeUser();
      const absent = await makeUser({ role: 'manager' });
      await makeUser({ isActive: false });
      await makeUser({ deletedAt: new Date() });
      await makeUser({ joinedDate: new Date('2026-11-01T00:00:00Z') });

      const presentRow = await Attendance.create({
        userId: present._id,
        date: WORKDAY,
        status: 'present',
        checkInTime: new Date(`${WORKDAY}T03:30:00Z`),
      });
      const presentUpdatedAt = presentRow.updatedAt.getTime();

      const result = await runDailyAbsentMarking(WORKDAY);

      expect(result).toMatchObject({ skipped: false, processedCount: 2, insertedCount: 1 });

      const rows = await Attendance.find({ date: WORKDAY }).lean();
      expect(rows).toHaveLength(2);

      const absentRow = rows.find((r) => String(r.userId) === String(absent._id));
      expect(absentRow).toMatchObject({ status: 'absent', checkInMethod: null, actualWorkMinutes: 0 });
      expect(absentRow.createdAt).toBeInstanceOf(Date);
      expect(absentRow.updatedAt).toBeInstanceOf(Date);

      const untouched = rows.find((r) => String(r.userId) === String(present._id));
      expect(untouched.status).toBe('present');
      expect(untouched.updatedAt.getTime()).toBe(presentUpdatedAt);

      expect(await JobRunMarker.exists({ job: ABSENT_JOB, date: WORKDAY })).toBeTruthy();
    });

    it('is idempotent: a re-run creates no duplicates and does not bump updatedAt', async () => {
      await makeUser();
      await runDailyAbsentMarking(WORKDAY);
      const [first] = await Attendance.find({ date: WORKDAY }).lean();

      await new Promise((r) => setTimeout(r, 20));
      const rerun = await runDailyAbsentMarking(WORKDAY);

      const rows = await Attendance.find({ date: WORKDAY }).lean();
      expect(rerun.insertedCount).toBe(0);
      expect(rows).toHaveLength(1);
      expect(rows[0].updatedAt.getTime()).toBe(first.updatedAt.getTime());
    });

    it('writes leave rows with type and fraction for approved leave', async () => {
      const fullDay = await makeUser();
      const halfDay = await makeUser();
      const multiDay = await makeUser();
      const lt = await makeLeaveType();
      const base = { leaveTypeId: lt._id, reason: 'Personal', status: 'approved' };

      await LeaveRequest.create({ ...base, userId: fullDay._id, startDate: WORKDAY, endDate: WORKDAY, totalDays: 1 });
      await LeaveRequest.create({ ...base, userId: halfDay._id, startDate: WORKDAY, endDate: WORKDAY, totalDays: 0.5 });
      await LeaveRequest.create({
        ...base, userId: multiDay._id, startDate: shift(WORKDAY, -1), endDate: shift(WORKDAY, 1), totalDays: 1.5,
      });

      await runDailyAbsentMarking(WORKDAY);

      const byUser = async (u) => Attendance.findOne({ userId: u._id, date: WORKDAY }).lean();
      expect(await byUser(fullDay)).toMatchObject({ status: 'leave', leaveTypeName: 'Casual Leave', leaveFraction: 1 });
      expect(await byUser(halfDay)).toMatchObject({ status: 'leave', leaveFraction: 0.5 });
      expect(await byUser(multiDay)).toMatchObject({ status: 'leave', leaveFraction: 1 });
    });

    it('skips weekends and holidays without writing rows or a marker', async () => {
      await makeUser();

      expect(await runDailyAbsentMarking('2026-10-24')).toMatchObject({ skipped: true, reason: 'weekend' });
      expect(await runDailyAbsentMarking('2026-10-02')).toMatchObject({ skipped: true, reason: 'holiday' });

      expect(await Attendance.countDocuments()).toBe(0);
      expect(await JobRunMarker.countDocuments()).toBe(0);
    });

    it('a late check-in on an absent row turns it present (row reuse)', async () => {
      const u = await makeUser();
      await runDailyAbsentMarking(WORKDAY);

      const row = await Attendance.findOne({ userId: u._id, date: WORKDAY });
      row.checkInTime = new Date();
      row.status = 'present';
      await row.save(); // checkInMethod: null must pass enum validation on save

      expect((await Attendance.findById(row._id).lean()).status).toBe('present');
    });
  });

  describe('catchUpMissedAbsentRuns', () => {
    it('back-fills missed working days only, skipping completed and non-working days', async () => {
      await makeUser();
      await JobRunMarker.create({ job: ABSENT_JOB, date: '2026-10-26', completedAt: new Date() });

      // Tue 2026-10-27 10:00 IST: before the 18:30 cutoff, so today is not processed
      const processed = await catchUpMissedAbsentRuns({
        referenceDate: new Date('2026-10-27T04:30:00Z'),
        lookbackDays: 7,
      });

      // 20 (Tue) .. 23 (Fri); 24/25 weekend, 26 already marked
      expect(processed).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    });

    it('includes today after 18:30 IST and respects ABSENT_MARKING_START_DATE', async () => {
      await makeUser();
      process.env.ABSENT_MARKING_START_DATE = '2026-10-26';

      const processed = await catchUpMissedAbsentRuns({
        referenceDate: new Date('2026-10-27T13:15:00Z'), // 18:45 IST
        lookbackDays: 7,
      });

      expect(processed).toEqual(['2026-10-26', '2026-10-27']);
    });
  });

  describe('two-way leave sync', () => {
    const today = getTodayDateString('Asia/Kolkata');
    const yesterday = shift(today, -1);

    it('approval flips unpunched absent rows to leave; punched rows stay', async () => {
      const u = await makeUser();
      const lt = await makeLeaveType();
      await Attendance.create({ userId: u._id, date: yesterday, status: 'absent' });
      await Attendance.create({ userId: u._id, date: today, status: 'present', checkInTime: new Date() });

      const leave = await LeaveRequest.create({
        userId: u._id, leaveTypeId: lt._id, startDate: yesterday, endDate: today, totalDays: 2, reason: 'Trip',
      });

      await makeLeaveDecision({ leaveId: leave._id, decidedBy: admin, decision: 'approved' });

      const y = await Attendance.findOne({ userId: u._id, date: yesterday }).lean();
      const t = await Attendance.findOne({ userId: u._id, date: today }).lean();
      expect(y).toMatchObject({ status: 'leave', leaveTypeName: 'Casual Leave', leaveFraction: 1 });
      expect(String(y.leaveRequestId)).toBe(String(leave._id));
      expect(t.status).toBe('present');
    });

    it('reversal flips only rows written for that leave back to absent', async () => {
      const u = await makeUser();
      const lt = await makeLeaveType();
      const leave = await LeaveRequest.create({
        userId: u._id, leaveTypeId: lt._id, startDate: yesterday, endDate: yesterday, totalDays: 1,
        reason: 'Trip', status: 'approved',
      });
      const otherLeave = await LeaveRequest.create({
        userId: u._id, leaveTypeId: lt._id, startDate: shift(today, -2), endDate: shift(today, -2), totalDays: 1,
        reason: 'Other', status: 'approved',
      });
      await Attendance.create({ userId: u._id, date: yesterday, status: 'leave', leaveRequestId: leave._id, leaveFraction: 1 });
      await Attendance.create({ userId: u._id, date: shift(today, -2), status: 'leave', leaveRequestId: otherLeave._id, leaveFraction: 1 });

      await overrideLeaveDecision({
        leaveId: leave._id, adminUser: admin, newDecision: 'rejected', overrideReason: 'Not eligible',
      });

      const reverted = await Attendance.findOne({ userId: u._id, date: yesterday }).lean();
      const other = await Attendance.findOne({ userId: u._id, date: shift(today, -2) }).lean();
      expect(reverted).toMatchObject({ status: 'absent', leaveRequestId: null, leaveFraction: null });
      expect(other.status).toBe('leave');
    });
  });

  describe('daily-log reactivity (regression)', () => {
    it('submitting a daily log bumps the attendance row updatedAt', async () => {
      const u = await makeUser();
      const today = getTodayDateString();
      const row = await Attendance.create({ userId: u._id, date: today, status: 'present', checkInTime: new Date() });
      const before = row.updatedAt.getTime();

      await new Promise((r) => setTimeout(r, 20));
      await submitDailyLog({
        user: u,
        logData: { hoursSpent: 8, taskTitle: 'Work' },
        file: { originalname: 'log.pdf', size: 100 },
      });

      const after = await Attendance.findById(row._id).lean();
      expect(after.dailyLogSubmitted).toBe(true);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before);
    });

    it('auto-submitting a missing daily log bumps the attendance row updatedAt', async () => {
      const u = await makeUser();
      const row = await Attendance.create({ userId: u._id, date: WORKDAY, status: 'present', actualWorkMinutes: 480 });
      const before = row.updatedAt.getTime();

      await new Promise((r) => setTimeout(r, 20));
      await autoSubmitMissingDailyLog({ user: u, attendance: row, logDate: WORKDAY });

      const after = await Attendance.findById(row._id).lean();
      expect(after.updatedAt.getTime()).toBeGreaterThan(before);
    });
  });
});

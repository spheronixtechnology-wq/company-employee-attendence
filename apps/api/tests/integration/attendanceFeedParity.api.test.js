const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Team = require('../../src/models/Team');
const Attendance = require('../../src/models/Attendance');
const DailyLog = require('../../src/models/DailyLog');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

const DATE = '2026-10-27';
const AUDIT_KEYS = [
  'checkInMethod', 'checkInIp', 'checkOutIp', 'checkInLocation', 'checkOutLocation',
  'distanceFromOffice', 'geofenceStatus', 'breaks',
];

describe('GET /api/integrations/v1/attendance: record parity & audit scope gating', () => {
  let adminUser;
  let team;
  let worker;
  let absentee;

  const makeKey = async (scopes, extra = {}) =>
    (
      await generateCredential({
        name: `Key ${scopes.join(',')}`,
        environment: 'live',
        scopes,
        expiresInDays: 30,
        createdBy: adminUser._id,
        ...extra,
      })
    ).rawKey;

  const fetchAttendance = async (key, query = '') => {
    // Watermark must sit >=10s in the past; move all rows behind it first.
    await Attendance.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 60_000) } });
    const wm = new Date(Date.now() - 15_000).toISOString();
    return request(app)
      .get(`/api/integrations/v1/attendance?watermark=${wm}${query}`)
      .set('Authorization', `Bearer ${key}`);
  };

  const byUser = (res, user) => res.body.data.find((r) => r.userId === String(user._id));

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearDatabase();

    adminUser = await User.create({
      name: 'System Admin', email: 'sysadmin@spheronix.com', passwordHash: 'Password@123', role: 'admin',
    });
    team = await Team.create({ name: 'Core Platform Engineering' });

    worker = await User.create({
      name: 'Yashwanth Kumar', email: 'yash@spheronix.com', passwordHash: 'Password@123', role: 'employee',
      employeeId: 'EMP-0903', department: 'Engineering', designation: 'Software Engineer', teamId: team._id,
    });
    absentee = await User.create({
      name: 'Priya Sharma', email: 'priya@spheronix.com', passwordHash: 'Password@123', role: 'employee',
      employeeId: 'EMP-0912', department: 'Operations', designation: 'HR Executive',
    });

    await Attendance.create({
      userId: worker._id,
      date: DATE,
      status: 'present',
      checkInTime: new Date(`${DATE}T03:30:00Z`),
      checkOutTime: new Date(`${DATE}T12:30:00Z`),
      totalDurationMinutes: 540,
      totalBreakMinutes: 60,
      actualWorkMinutes: 485,
      checkInMethod: 'qr_code',
      checkInIp: '106.51.72.18',
      checkOutIp: '106.51.72.19',
      checkInLocation: { lat: 12.935242, lng: 77.624462, accuracy: 12.4, capturedAt: new Date() },
      distanceFromOffice: 18.5,
      geofenceStatus: 'VERIFIED',
      breaks: [
        { type: 'meal', startedAt: new Date(`${DATE}T07:30:00Z`), endedAt: new Date(`${DATE}T08:30:00Z`) },
        { type: 'personal', startedAt: new Date(`${DATE}T10:00:00Z`) },
      ],
    });
    await DailyLog.create({
      userId: worker._id, teamId: team._id, logDate: DATE, hoursSpent: 8,
      projectName: 'HRMS Integration', taskTitle: 'API Gateway Parity', blockers: 'None',
    });

    await Attendance.create({
      userId: absentee._id, date: DATE, status: 'absent', checkInMethod: null,
    });
  });

  it('attendance-daily:read flattens employee context, daily log and work hours; no audit fields', async () => {
    const key = await makeKey(['attendance-daily:read']);
    const res = await fetchAttendance(key);

    expect(res.status).toBe(200);
    const row = byUser(res, worker);
    expect(row).toMatchObject({
      userId: String(worker._id),
      employeeId: 'EMP-0903',
      employeeName: 'Yashwanth Kumar',
      department: 'Engineering',
      designation: 'Software Engineer',
      teamName: 'Core Platform Engineering',
      date: DATE,
      status: 'present',
      actualWorkMinutes: 485,
      formattedWorkHours: '8h 05m',
      dailyLog: {
        submitted: true, hoursSpent: 8, projectName: 'HRMS Integration',
        taskTitle: 'API Gateway Parity', blockers: 'None',
      },
      autoCheckedOut: false,
    });
    expect(typeof row.userId).toBe('string');
    for (const k of AUDIT_KEYS) expect(row).not.toHaveProperty(k);
  });

  it('emits explicit absent rows with zeroed metrics and an unsubmitted daily log', async () => {
    const key = await makeKey(['attendance-daily:read']);
    const res = await fetchAttendance(key);

    expect(byUser(res, absentee)).toMatchObject({
      employeeId: 'EMP-0912',
      employeeName: 'Priya Sharma',
      teamName: null,
      status: 'absent',
      checkInTime: null,
      checkOutTime: null,
      actualWorkMinutes: 0,
      formattedWorkHours: '0h 00m',
      dailyLog: { submitted: false, hoursSpent: 0, projectName: null, taskTitle: null, blockers: null },
    });
  });

  it('carries leave type and fraction on leave rows', async () => {
    await Attendance.updateOne(
      { userId: absentee._id, date: DATE },
      { $set: { status: 'leave', leaveTypeName: 'Casual Leave', leaveFraction: 0.5 } }
    );
    const key = await makeKey(['attendance-daily:read']);
    const res = await fetchAttendance(key);

    expect(byUser(res, absentee)).toMatchObject({ status: 'leave', leaveTypeName: 'Casual Leave', leaveFraction: 0.5 });
  });

  it('attendance-audit:read adds IPs, GPS, geofence and breaks with computed durations', async () => {
    const key = await makeKey(['attendance-daily:read', 'attendance-audit:read']);
    const res = await fetchAttendance(key);

    const row = byUser(res, worker);
    expect(row).toMatchObject({
      checkInMethod: 'qr_code',
      checkInIp: '106.51.72.18',
      checkOutIp: '106.51.72.19',
      checkInLocation: { lat: 12.935242, lng: 77.624462, accuracy: 12.4 },
      checkOutLocation: null,
      distanceFromOffice: 18.5,
      geofenceStatus: 'VERIFIED',
    });
    expect(row.checkInLocation).not.toHaveProperty('capturedAt');
    expect(row.breaks).toEqual([
      { type: 'meal', startedAt: `${DATE}T07:30:00.000Z`, endedAt: `${DATE}T08:30:00.000Z`, durationMinutes: 60 },
      { type: 'personal', startedAt: `${DATE}T10:00:00.000Z`, endedAt: null, durationMinutes: null },
    ]);

    const absent = byUser(res, absentee);
    expect(absent).toMatchObject({ checkInMethod: null, checkInLocation: null, breaks: [] });
  });

  it('attendance-audit:read alone does not grant access to the feed', async () => {
    const key = await makeKey(['attendance-audit:read']);
    const res = await fetchAttendance(key);
    expect(res.status).toBe(403);
  });

  it('keeps userId when the user document no longer exists', async () => {
    const ghostId = new mongoose.Types.ObjectId();
    await Attendance.create({ userId: ghostId, date: DATE, status: 'absent' });
    const key = await makeKey(['attendance-daily:read']);
    const res = await fetchAttendance(key);

    const ghost = res.body.data.find((r) => r.userId === String(ghostId));
    expect(ghost).toMatchObject({ userId: String(ghostId), employeeId: null, employeeName: null });
  });

  it('restricted key only sees its audience, with context attached', async () => {
    const key = await makeKey(['attendance-daily:read'], {
      employeeScope: 'restricted',
      allowedEmployees: [absentee._id],
    });
    const res = await fetchAttendance(key);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ employeeName: 'Priya Sharma', status: 'absent' });
  });

  it('cursor pagination still works on the shaped items', async () => {
    const key = await makeKey(['attendance-daily:read']);
    const first = await fetchAttendance(key, '&limit=1');

    expect(first.body.data).toHaveLength(1);
    const second = await request(app)
      .get(`/api/integrations/v1/attendance?cursor=${encodeURIComponent(first.body.pagination.nextCursor)}&limit=10`)
      .set('Authorization', `Bearer ${key}`);

    expect(second.status).toBe(200);
    const ids = [...first.body.data, ...second.body.data].map((r) => r._id);
    expect(new Set(ids).size).toBe(2);
  });
});

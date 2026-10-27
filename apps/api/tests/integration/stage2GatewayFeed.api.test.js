const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Attendance = require('../../src/models/Attendance');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');
const { backdate } = require('../helpers/backdate');

describe('Stage 2 Integration Gateway Feeds (Integration)', () => {
  let adminUser;
  let fullScopeKey;
  let employeeOnlyKey;
  let attendanceOnlyKey;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearDatabase();

    adminUser = await User.create({
      name: 'System Admin',
      email: 'sysadmin@spheronix.com',
      passwordHash: 'Password@123',
      role: 'admin',
      tokenVersion: 0,
    });

    const fullCred = await generateCredential({
      name: 'Full Scope Key',
      environment: 'live',
      scopes: ['employees:read', 'attendance-daily:read', 'attendance-events:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });
    fullScopeKey = fullCred.rawKey;

    const empCred = await generateCredential({
      name: 'Employees Only Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });
    employeeOnlyKey = empCred.rawKey;

    const attCred = await generateCredential({
      name: 'Attendance Only Key',
      environment: 'live',
      scopes: ['attendance-daily:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });
    attendanceOnlyKey = attCred.rawKey;
  });

  describe('GET /api/integrations/v1/attendance', () => {
    it('should reject request when watermark parameter is missing', async () => {
      const res = await request(app)
        .get('/api/integrations/v1/attendance')
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('WATERMARK_REQUIRED');
    });

    it('should reject request when watermark parameter is invalid date', async () => {
      const res = await request(app)
        .get('/api/integrations/v1/attendance?watermark=not-a-valid-date')
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_WATERMARK');
    });

    it('should reject with 403 when credential lacks attendance-daily:read scope', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}`)
        .set('Authorization', `Bearer ${employeeOnlyKey}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('attendance-daily:read');
    });

    it('should paginate deterministically and preserve unfinalized statuses without silent conversion', async () => {
      const emp = await User.create({
        name: 'Jane Doe',
        email: 'jane.doe@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });
      await backdate(User, [emp._id], 10 * 60 * 1000);

      const baseTime = Date.now() - 300000; // 5 mins ago
      // Create 3 records with explicit statuses: present, incomplete, manual_pending
      const a1 = await Attendance.create({
        userId: emp._id,
        date: '2026-10-21',
        status: 'present',
        checkInTime: new Date(baseTime - 300000),
        checkOutTime: new Date(baseTime - 100000),
        actualWorkMinutes: 200,
      });
      await Attendance.collection.updateOne({ _id: a1._id }, { $set: { updatedAt: new Date(baseTime - 50000) } });

      const a2 = await Attendance.create({
        userId: emp._id,
        date: '2026-10-22',
        status: 'incomplete', // Critical: Must NOT become absent!
        checkInTime: new Date(baseTime - 200000),
      });
      await Attendance.collection.updateOne({ _id: a2._id }, { $set: { updatedAt: new Date(baseTime - 40000) } });

      const a3 = await Attendance.create({
        userId: emp._id,
        date: '2026-10-23',
        status: 'manual_pending', // Critical: Must NOT become absent!
      });
      await Attendance.collection.updateOne({ _id: a3._id }, { $set: { updatedAt: new Date(baseTime - 30000) } });

      const watermark = new Date(Date.now() - 60000).toISOString(); // 1 min ago

      // Page 1: limit 2
      const res1 = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&limit=2`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.length).toBe(2);
      expect(res1.body.data[0].status).toBe('present');
      expect(res1.body.data[1].status).toBe('incomplete'); // preserved exactly
      expect(res1.body.pagination.nextCursor).toBeDefined();

      const nextCursor = res1.body.pagination.nextCursor;

      // Page 2: pass nextCursor
      const res2 = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&cursor=${nextCursor}&limit=2`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBe(1);
      expect(res2.body.data[0].status).toBe('manual_pending'); // preserved exactly
      expect(res2.body.pagination.nextCursor).toBeNull();
    });

    it('should reject tampered cursor signature with 400', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const tamperedCursor = 'eyJ0ZW5hbnQiOiJmYWtlIn0.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&cursor=${tamperedCursor}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR_SIGNATURE');
    });

    it('should reject cursor when reused on a different endpoint (Context Binding)', async () => {
      const emp = await User.create({
        name: 'John Smith',
        email: 'john.smith@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });

      const alice = await User.create({
        name: 'Alice Wonder',
        email: 'alice@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });
      await backdate(User, [emp._id, alice._id], 10 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();

      // Get valid cursor from /employees
      const empResPage = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}&limit=1`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      const empCursor = empResPage.body.pagination.nextCursor;
      expect(empCursor).toBeDefined();

      // Reusing employee cursor on attendance endpoint must be rejected with 400!
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&cursor=${empCursor}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CURSOR_CONTEXT_MISMATCH');
    });

    it('should respect upper watermark boundary and exclude newer records', async () => {
      const emp = await User.create({
        name: 'Bob Ross',
        email: 'bob.ross@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });
      await backdate(User, [emp._id], 15 * 60 * 1000);

      const tPast = new Date(Date.now() - 180000);
      const tWatermark = new Date(Date.now() - 60000);
      const tFuture = new Date(Date.now() - 30000);

      // Record before watermark
      const attPast = await Attendance.create({
        userId: emp._id,
        date: '2026-10-20',
        status: 'present',
      });
      await Attendance.collection.updateOne({ _id: attPast._id }, { $set: { updatedAt: tPast } });

      // Record created after watermark
      const attFuture = await Attendance.create({
        userId: emp._id,
        date: '2026-10-21',
        status: 'present',
      });
      await Attendance.collection.updateOne({ _id: attFuture._id }, { $set: { updatedAt: tFuture } });

      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${tWatermark.toISOString()}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].date).toBe('2026-10-20');
    });
  });

  describe('GET /api/integrations/v1/employees', () => {
    it('should enforce strict projection and never leak passwords or MFA secrets', async () => {
      const secretUser = await User.create({
        name: 'Secret User',
        email: 'secret@spheronix.com',
        passwordHash: 'SuperSecretHash$123',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaPendingSecret: 'PENDING123',
        role: 'employee',
        department: 'Engineering',
        designation: 'Staff Engineer',
        tokenVersion: 5,
      });
      await backdate(User, [secretUser._id], 10 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      const userDoc = res.body.data.find((u) => u.email === 'secret@spheronix.com');
      expect(userDoc).toBeDefined();
      expect(userDoc.name).toBe('Secret User');
      expect(userDoc.department).toBe('Engineering');
      expect(userDoc.designation).toBe('Staff Engineer');

      // Crucial security checks: sensitive fields MUST NOT exist
      expect(userDoc.passwordHash).toBeUndefined();
      expect(userDoc.mfaSecret).toBeUndefined();
      expect(userDoc.mfaPendingSecret).toBeUndefined();
      expect(userDoc.tokenVersion).toBeUndefined();
    });

    it('should reject with 403 when credential lacks employees:read scope', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}`)
        .set('Authorization', `Bearer ${attendanceOnlyKey}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('employees:read');
    });
  });

  describe('GET /api/integrations/v1/attendance-events', () => {
    it('should return synthetic punch events <_id>_IN and <_id>_OUT', async () => {
      const emp = await User.create({
        name: 'Punch User',
        email: 'punch@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });

      const inTime = new Date('2026-10-24T09:00:00.000Z');
      const outTime = new Date('2026-10-24T18:00:00.000Z');

      const att = await Attendance.create({
        userId: emp._id,
        date: '2026-10-24',
        status: 'present',
        checkInTime: inTime,
        checkOutTime: outTime,
        checkInMethod: 'qr_code',
      });
      await Attendance.collection.updateOne(
        { _id: att._id },
        { $set: { updatedAt: new Date('2026-10-24T18:05:00.000Z') } }
      );

      const watermark = new Date('2026-10-24T19:00:00.000Z').toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance-events?watermark=${watermark}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);

      const inEvent = res.body.data.find((e) => e.logType === 'IN');
      expect(inEvent).toBeDefined();
      expect(inEvent.eventId).toBe(`${att._id.toString()}_IN`);
      expect(inEvent.device).toBe('qr_code');

      const outEvent = res.body.data.find((e) => e.logType === 'OUT');
      expect(outEvent).toBeDefined();
      expect(outEvent.eventId).toBe(`${att._id.toString()}_OUT`);
    });
  });

  describe('Employee Scoping and Fail-Closed Audience Enforcement (RFC-INT-002)', () => {
    let allowedEmployee1;
    let allowedEmployee2;
    let unauthorizedEmployee;
    let restrictedKey;
    let otherOrgKey;

    beforeEach(async () => {
      allowedEmployee1 = await User.create({
        name: 'Allowed Employee One',
        email: 'emp1@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
        department: 'Engineering',
      });

      allowedEmployee2 = await User.create({
        name: 'Allowed Employee Two',
        email: 'emp2@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
        department: 'Design',
      });

      unauthorizedEmployee = await User.create({
        name: 'Unauthorized Employee',
        email: 'unauth@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
        department: 'Finance',
      });
      await backdate(User, [allowedEmployee1._id, allowedEmployee2._id, unauthorizedEmployee._id], 10 * 60 * 1000);

      const restrictedCred = await generateCredential({
        name: 'Restricted Key',
        environment: 'live',
        scopes: ['employees:read', 'attendance-daily:read', 'attendance-events:read'],
        employeeScope: 'restricted',
        allowedEmployees: [allowedEmployee1._id, allowedEmployee2._id],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });
      restrictedKey = restrictedCred.rawKey;

      const otherCred = await generateCredential({
        name: 'Other Integration Key',
        environment: 'live',
        scopes: ['employees:read', 'attendance-daily:read', 'attendance-events:read'],
        employeeScope: 'all',
        expiresInDays: 30,
        createdBy: adminUser._id,
      });
      otherOrgKey = otherCred.rawKey;
    });

    it('GET /employees should return ONLY allowed employees for restricted key', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const returnedEmails = res.body.data.map((e) => e.email);
      expect(returnedEmails).toContain('emp1@spheronix.com');
      expect(returnedEmails).toContain('emp2@spheronix.com');
      expect(returnedEmails).not.toContain('unauth@spheronix.com');
      expect(returnedEmails).not.toContain('sysadmin@spheronix.com');
    });

    it('GET /employees should return all employees for org-wide key', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(200);
      const returnedEmails = res.body.data.map((e) => e.email);
      expect(returnedEmails).toContain('emp1@spheronix.com');
      expect(returnedEmails).toContain('emp2@spheronix.com');
      expect(returnedEmails).toContain('unauth@spheronix.com');
    });

    it('GET /employees parameter tampering should be ignored and never leak unauthorized users', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}&department=Finance&userId=${unauthorizedEmployee._id}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(200);
      const returnedEmails = res.body.data.map((e) => e.email);
      expect(returnedEmails).not.toContain('unauth@spheronix.com');
    });

    it('GET /attendance should emit records ONLY for allowed employees', async () => {
      const a1 = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-21',
        status: 'present',
      });
      const a2 = await Attendance.create({
        userId: unauthorizedEmployee._id,
        date: '2026-10-21',
        status: 'present',
      });
      await backdate(Attendance, [a1._id, a2._id], 5 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].userId.toString()).toBe(allowedEmployee1._id.toString());
    });

    it('GET /attendance-events should emit punch events ONLY for allowed employees', async () => {
      const baseTime = Date.now() - 300000;
      const inTime = new Date(baseTime - 3600000);
      const outTime = new Date(baseTime - 1800000);

      // Record for allowed employee
      const a1 = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-25',
        status: 'present',
        checkInTime: inTime,
        checkOutTime: outTime,
      });

      // Record for unauthorized employee
      const a2 = await Attendance.create({
        userId: unauthorizedEmployee._id,
        date: '2026-10-25',
        status: 'present',
        checkInTime: inTime,
        checkOutTime: outTime,
      });
      await backdate(Attendance, [a1._id, a2._id], 5 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance-events?watermark=${watermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].userId.toString()).toBe(allowedEmployee1._id.toString());
      expect(res.body.data[1].userId.toString()).toBe(allowedEmployee1._id.toString());
      // No punch events from unauthorizedEmployee
      const foundUnauth = res.body.data.some((e) => e.userId.toString() === unauthorizedEmployee._id.toString());
      expect(foundUnauth).toBe(false);
    });

    it('GET /attendance-events should emit only _IN when checkOutTime is null, and both when checked out', async () => {
      const baseTime = Date.now() - 300000;
      const inTime = new Date(baseTime - 7200000);
      const att = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-25',
        status: 'incomplete',
        checkInTime: inTime,
        checkOutTime: null,
      });
      await backdate(Attendance, [att._id], 5 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();
      const res1 = await request(app)
        .get(`/api/integrations/v1/attendance-events?watermark=${watermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.length).toBe(1);
      expect(res1.body.data[0].eventId).toBe(`${att._id.toString()}_IN`);
      expect(res1.body.data[0].logType).toBe('IN');

      // Now simulate employee checks out
      const outTime = new Date(baseTime - 3600000);
      await Attendance.updateOne(
        { _id: att._id },
        { status: 'present', checkOutTime: outTime }
      );
      await Attendance.collection.updateOne(
        { _id: att._id },
        { $set: { updatedAt: new Date(Date.now() - 90000) } }
      );

      const watermark2 = new Date(Date.now() - 30000).toISOString();
      const res2 = await request(app)
        .get(`/api/integrations/v1/attendance-events?watermark=${watermark2}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBe(2);
      const inEvent = res2.body.data.find((e) => e.logType === 'IN');
      const outEvent = res2.body.data.find((e) => e.logType === 'OUT');
      expect(inEvent.eventId).toBe(`${att._id.toString()}_IN`);
      expect(outEvent.eventId).toBe(`${att._id.toString()}_OUT`);
    });

    it('should paginate deterministically using tie-breaker when multiple records share identical updatedAt', async () => {
      const sameTime = new Date('2026-10-25T10:00:00.000Z');

      const a1 = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-21',
        status: 'present',
      });
      await Attendance.collection.updateOne({ _id: a1._id }, { $set: { updatedAt: sameTime } });

      const a2 = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-22',
        status: 'present',
      });
      await Attendance.collection.updateOne({ _id: a2._id }, { $set: { updatedAt: sameTime } });

      const a3 = await Attendance.create({
        userId: allowedEmployee1._id,
        date: '2026-10-23',
        status: 'present',
      });
      await Attendance.collection.updateOne({ _id: a3._id }, { $set: { updatedAt: sameTime } });

      const watermark = new Date('2026-10-25T11:00:00.000Z').toISOString();

      // Page 1 with limit=2
      const resPage1 = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&limit=2`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.length).toBe(2);
      expect(resPage1.body.pagination.nextCursor).toBeDefined();

      const cursor = resPage1.body.pagination.nextCursor;

      // Page 2 using cursor
      const resPage2 = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&cursor=${cursor}&limit=2`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);

      // Verify no duplicates across pages
      const page1Ids = resPage1.body.data.map((d) => d._id);
      const page2Ids = resPage2.body.data.map((d) => d._id);
      expect(page1Ids).not.toContain(page2Ids[0]);
    });

    it('should reject cursor generated by another key (Cross-Key Cursor Tampering)', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();

      // Generate valid cursor using otherOrgKey
      const res1 = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}&limit=1`)
        .set('Authorization', `Bearer ${otherOrgKey}`);

      const cursor = res1.body.pagination.nextCursor;
      expect(cursor).toBeDefined();

      // Submit that cursor using restrictedKey
      const res2 = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}&cursor=${cursor}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe('CURSOR_CONTEXT_MISMATCH');
    });

    it('should reject future watermark beyond 5 minutes skew', async () => {
      const futureWatermark = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${futureWatermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WATERMARK_FUTURE');
    });

    it('should reject malformed updated_since query parameter', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${watermark}&updated_since=invalid-date`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UPDATED_SINCE');
    });

    it('rejects watermark within 10s of now with WATERMARK_TOO_RECENT', async () => {
      const tooRecentWatermark = new Date(Date.now() - 2000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${tooRecentWatermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WATERMARK_TOO_RECENT');
    });

    it('rejects watermark more than 5 minutes ahead with WATERMARK_FUTURE', async () => {
      const farFutureWatermark = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/attendance?watermark=${farFutureWatermark}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WATERMARK_FUTURE');
    });

    it('continuation page is not subject to TOO_RECENT', async () => {
      const watermark = new Date(Date.now() - 60000).toISOString();
      const res1 = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}&limit=1`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res1.status).toBe(200);
      const cursor = res1.body.pagination.nextCursor;
      expect(cursor).toBeDefined();

      // Immediately request continuation page: cursor carries the watermark
      const res2 = await request(app)
        .get(`/api/integrations/v1/employees?cursor=${cursor}`)
        .set('Authorization', `Bearer ${restrictedKey}`);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
    });

    it('emits soft-deleted employee with deletedAt', async () => {
      const deletedEmp = await User.create({
        name: 'Soft Deleted User',
        email: 'softdel@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
        department: 'Engineering',
        isActive: false,
        deletedAt: new Date(Date.now() - 120000),
      });
      await backdate(User, [deletedEmp._id], 15 * 60 * 1000);

      const watermark = new Date(Date.now() - 60000).toISOString();
      const res = await request(app)
        .get(`/api/integrations/v1/employees?watermark=${watermark}`)
        .set('Authorization', `Bearer ${fullScopeKey}`);

      expect(res.status).toBe(200);
      const record = res.body.data.find((e) => e.email === 'softdel@spheronix.com');
      expect(record).toBeDefined();
      expect(record.deletedAt).toBeDefined();
      expect(new Date(record.deletedAt).getTime()).toBe(deletedEmp.deletedAt.getTime());
    });
  });
});

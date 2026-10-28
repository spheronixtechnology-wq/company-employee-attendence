const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Team = require('../../src/models/Team');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

const PII_KEYS = ['middleName', 'lastName', 'currentAddress', 'emergencyContact', 'avatarUrl'];

describe('GET /api/integrations/v1/employees: profile parity & PII scope gating', () => {
  let adminUser;
  let team;
  let manager;
  let employee;

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

  const fetchEmployees = async (key, query = '') => {
    // Watermark must sit >=10s in the past; move all fixtures behind it first.
    await User.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 60_000) } });
    const wm = new Date(Date.now() - 15_000).toISOString();
    return request(app)
      .get(`/api/integrations/v1/employees?watermark=${wm}${query}`)
      .set('Authorization', `Bearer ${key}`);
  };

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
    });

    team = await Team.create({ name: 'Core Platform Engineering' });

    manager = await User.create({
      name: 'Viswa Manager',
      email: 'manager@spheronix.com',
      passwordHash: 'Password@123',
      role: 'manager',
      employeeId: 'EMP-0901',
    });

    employee = await User.create({
      name: 'Yashwanth Kumar',
      middleName: 'V',
      lastName: 'Kumar',
      email: 'yash@gmail.com',
      companyEmail: 'yash@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      employeeId: 'EMP-0903',
      phone: '+919876543210',
      gender: 'Male',
      dob: new Date('1995-05-15T00:00:00Z'),
      department: 'Engineering',
      designation: 'Software Engineer',
      workLocation: 'Bangalore Office',
      officeBranch: 'Koramangala HQ',
      country: 'India',
      teamShift: 'General Day Shift',
      teamId: team._id,
      reportingManager: manager._id,
      currentAddress: '123, 4th Cross, Koramangala',
      emergencyContactName: 'Ramesh Kumar',
      emergencyContactRelation: 'Father',
      emergencyContactNumber: '+919845012345',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  const findEmp = (res) => res.body.data.find((e) => e.employeeId === 'EMP-0903');

  it('employees:read returns org, team and manager details but no PII-scoped fields', async () => {
    const key = await makeKey(['employees:read']);
    const res = await fetchEmployees(key);

    expect(res.status).toBe(200);
    const emp = findEmp(res);
    expect(emp).toMatchObject({
      name: 'Yashwanth Kumar',
      companyEmail: 'yash@spheronix.com',
      officeBranch: 'Koramangala HQ',
      country: 'India',
      teamShift: 'General Day Shift',
      team: { _id: String(team._id), name: 'Core Platform Engineering' },
      reportingManager: {
        _id: String(manager._id),
        employeeId: 'EMP-0901',
        name: 'Viswa Manager',
        email: 'manager@spheronix.com',
      },
      // Frappe-required fields stay in the standard projection (backward compatible)
      phone: '+919876543210',
      gender: 'Male',
      dob: '1995-05-15T00:00:00.000Z',
    });
    for (const k of PII_KEYS) expect(emp).not.toHaveProperty(k);
    expect(emp).not.toHaveProperty('teamId');
    expect(emp).not.toHaveProperty('passwordHash');
  });

  it('employees:pii:read adds name parts, address, emergency contact and avatar', async () => {
    const key = await makeKey(['employees:read', 'employees:pii:read']);
    const res = await fetchEmployees(key);

    const emp = findEmp(res);
    expect(emp).toMatchObject({
      middleName: 'V',
      lastName: 'Kumar',
      currentAddress: '123, 4th Cross, Koramangala',
      emergencyContact: { name: 'Ramesh Kumar', relation: 'Father', phone: '+919845012345' },
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('employees:pii:read alone does not grant access to the feed', async () => {
    const key = await makeKey(['employees:pii:read']);
    const res = await fetchEmployees(key);
    expect(res.status).toBe(403);
  });

  it('restricted key: a manager outside the audience is reduced to { _id }', async () => {
    const key = await makeKey(['employees:read'], {
      employeeScope: 'restricted',
      allowedEmployees: [employee._id],
    });
    const res = await fetchEmployees(key);

    expect(res.body.data).toHaveLength(1);
    expect(findEmp(res).reportingManager).toEqual({ _id: String(manager._id) });
  });

  it('restricted key: a manager inside the audience is returned in full', async () => {
    const key = await makeKey(['employees:read'], {
      employeeScope: 'restricted',
      allowedEmployees: [employee._id, manager._id],
    });
    const res = await fetchEmployees(key);

    expect(findEmp(res).reportingManager).toMatchObject({ name: 'Viswa Manager', email: 'manager@spheronix.com' });
  });

  it('employees with no team or manager emit null objects', async () => {
    const key = await makeKey(['employees:read']);
    const res = await fetchEmployees(key);

    const mgr = res.body.data.find((e) => e.employeeId === 'EMP-0901');
    expect(mgr.team).toBeNull();
    expect(mgr.reportingManager).toBeNull();
  });

  it('cursor pagination still works on the shaped items', async () => {
    const key = await makeKey(['employees:read']);
    const first = await fetchEmployees(key, '&limit=1');

    expect(first.body.data).toHaveLength(1);
    expect(first.body.pagination.nextCursor).toBeTruthy();

    const second = await request(app)
      .get(`/api/integrations/v1/employees?cursor=${encodeURIComponent(first.body.pagination.nextCursor)}&limit=10`)
      .set('Authorization', `Bearer ${key}`);

    expect(second.status).toBe(200);
    const ids = [...first.body.data, ...second.body.data].map((e) => e._id);
    expect(new Set(ids).size).toBe(3); // admin, manager, employee
  });
});

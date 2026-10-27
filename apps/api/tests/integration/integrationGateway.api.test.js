const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const IntegrationRequestLog = require('../../src/models/IntegrationRequestLog');
const { generateCredential, revokeCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('Integration Gateway Pipeline & GET /ping (Integration)', () => {
  let adminUser;

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
  });

  it('should successfully authenticate GET /ping with valid raw key and return metadata', async () => {
    const { credential, rawKey } = await generateCredential({
      name: 'Frappe HRMS Production Sync',
      environment: 'live',
      scopes: ['employees:read', 'attendance-daily:read'],
      expiresInDays: 90,
      createdBy: adminUser._id,
    });

    const res = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Frappe HRMS Production Sync');
    expect(res.body.data.environment).toBe('live');
    expect(res.body.data.scopes).toEqual(['employees:read', 'attendance-daily:read']);
    expect(res.body.data.expiresAt).toBeDefined();

    // Verify request ID was injected
    expect(res.headers['x-request-id']).toBeDefined();

    // Verify request was logged in IntegrationRequestLog
    const log = await IntegrationRequestLog.findOne({ keyId: credential.keyId });
    expect(log).not.toBeNull();
    expect(log.status).toBe(200);
    expect(log.method).toBe('GET');
    expect(log.route).toBe('/api/integrations/v1/ping');
  });

  it('should immediately reject with 401 when a key is revoked (zero-cache test)', async () => {
    const { credential, rawKey } = await generateCredential({
      name: 'Test Key for Revocation',
      environment: 'test',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });

    // 1. Verify it works initially
    const res1 = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${rawKey}`);
    expect(res1.status).toBe(200);

    // 2. Revoke key
    await revokeCredential({
      keyId: credential.keyId,
      reason: 'manual',
      adminUser,
    });

    // 3. Immediately call /ping again -> must return 401 on next request!
    const res2 = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${rawKey}`);
    expect(res2.status).toBe(401);
    expect(res2.body.success).toBe(false);
  });

  it('should reject with 401 if key is expired', async () => {
    const { credential, rawKey } = await generateCredential({
      name: 'Expired Key Test',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });

    // Manually force expiry in the past
    await IntegrationCredential.updateOne(
      { keyId: credential.keyId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${rawKey}`);

    expect(res.status).toBe(401);
  });

  it('should keep other keys functional when one key is revoked (Multiple Keys Independence)', async () => {
    const keyA = await generateCredential({
      name: 'Key A',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });

    const keyB = await generateCredential({
      name: 'Key B',
      environment: 'live',
      scopes: ['attendance-daily:read'],
      expiresInDays: 60,
      createdBy: adminUser._id,
    });

    // Revoke Key A
    await revokeCredential({
      keyId: keyA.credential.keyId,
      reason: 'manual',
      adminUser,
    });

    // Key A fails
    const resA = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${keyA.rawKey}`);
    expect(resA.status).toBe(401);

    // Key B continues working cleanly
    const resB = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${keyB.rawKey}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data.name).toBe('Key B');
  });

  it('should prevent cross-contamination: User login token sent to /ping gets 401', async () => {
    const userToken = jwt.sign(
      { id: adminUser._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(401);
  });

  it('should prevent cross-contamination: Integration key sent to /api/admin/* gets 401', async () => {
    const { rawKey } = await generateCredential({
      name: 'Integration Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${rawKey}`);

    expect(res.status).toBe(401);
  });

  it('ping returns serverTime, audienceVersion, audienceChangedAt, expectedPollMinutes', async () => {
    const { rawKey } = await generateCredential({
      name: 'Ping Fields Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });

    const res = await request(app)
      .get('/api/integrations/v1/ping')
      .set('Authorization', `Bearer ${rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.serverTime).toBeDefined();
    expect(Math.abs(Date.parse(res.body.data.serverTime) - Date.now())).toBeLessThan(5000);
    expect(res.body.data.audienceVersion).toBe(1);
    expect(res.body.data.expectedPollMinutes).toBe(5);
    expect(res.body.data.audienceChangedAt).toBeDefined();
  });
});

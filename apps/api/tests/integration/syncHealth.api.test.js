const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const IntegrationRequestLog = require('../../src/models/IntegrationRequestLog');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('Sync Health & Key Settings API (Integration)', () => {
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearDatabase();

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@spheronix.com',
      passwordHash: 'Password@123',
      role: 'admin',
      mfaEnabled: false,
      tokenVersion: 0,
    });

    adminToken = jwt.sign(
      { id: adminUser._id, role: 'admin', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/admin/integrations/frappe-hrms/keys/sync-health', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/integrations/frappe-hrms/keys/sync-health');
      expect(res.status).toBe(401);
    });

    it('should evaluate sync health for keys accurately from IntegrationRequestLog', async () => {
      const { credential: credHealthy } = await generateCredential({
        name: 'Healthy Frappe Key',
        environment: 'live',
        scopes: ['employees:read', 'attendance-daily:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
        expectedPollMinutes: 5,
      });

      const { credential: credDelayed } = await generateCredential({
        name: 'Delayed Frappe Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
        expectedPollMinutes: 5,
      });

      const now = Date.now();

      // Log successful polls for credHealthy (3 mins ago)
      await IntegrationRequestLog.create([
        {
          keyId: credHealthy.keyId,
          route: '/api/integrations/v1/employees',
          method: 'GET',
          status: 200,
          durationMs: 45,
          requestId: 'req-1',
          createdAt: new Date(now - 3 * 60 * 1000),
        },
        {
          keyId: credHealthy.keyId,
          route: '/api/integrations/v1/attendance',
          method: 'GET',
          status: 200,
          durationMs: 50,
          requestId: 'req-2',
          createdAt: new Date(now - 2 * 60 * 1000),
        },
        // Ping route log - must be completely ignored in feed health!
        {
          keyId: credHealthy.keyId,
          route: '/api/integrations/v1/ping',
          method: 'GET',
          status: 200,
          durationMs: 10,
          requestId: 'req-3',
          createdAt: new Date(now - 1 * 60 * 1000),
        },
      ]);

      // Log a 429 rate limit for credDelayed
      await IntegrationRequestLog.create([
        {
          keyId: credDelayed.keyId,
          route: '/api/integrations/v1/employees',
          method: 'GET',
          status: 429,
          durationMs: 5,
          requestId: 'req-4',
          createdAt: new Date(now - 1 * 60 * 1000),
        },
      ]);

      const res = await request(app)
        .get('/api/admin/integrations/frappe-hrms/keys/sync-health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const healthHealthy = res.body.data.find((k) => k.keyId === credHealthy.keyId);
      expect(healthHealthy).toBeDefined();
      expect(healthHealthy.overallStatus).toBe('healthy');
      expect(healthHealthy.feeds.length).toBe(2); // Only employees and attendance, not attendance-events or ping!

      const healthDelayed = res.body.data.find((k) => k.keyId === credDelayed.keyId);
      expect(healthDelayed).toBeDefined();
      expect(healthDelayed.overallStatus).toBe('delayed');
    });

    it('should report waiting when no requests exist yet', async () => {
      const { credential } = await generateCredential({
        name: 'Brand New Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      const res = await request(app)
        .get('/api/admin/integrations/frappe-hrms/keys/sync-health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const report = res.body.data.find((k) => k.keyId === credential.keyId);
      expect(report.overallStatus).toBe('waiting');
    });
  });

  describe('PATCH /api/admin/integrations/keys/:keyId/settings', () => {
    it('should update expectedPollMinutes without requiring step-up token', async () => {
      const { credential } = await generateCredential({
        name: 'Poll Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
        expectedPollMinutes: 5,
      });

      const res = await request(app)
        .patch(`/api/admin/integrations/keys/${credential.keyId}/settings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expectedPollMinutes: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expectedPollMinutes).toBe(15);

      const updated = await IntegrationCredential.findOne({ keyId: credential.keyId });
      expect(updated.expectedPollMinutes).toBe(15);
    });

    it('should reject invalid expectedPollMinutes values', async () => {
      const { credential } = await generateCredential({
        name: 'Poll Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      const resNegative = await request(app)
        .patch(`/api/admin/integrations/keys/${credential.keyId}/settings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expectedPollMinutes: 0,
        });

      expect(resNegative.status).toBe(400);
      expect(resNegative.body.code).toBe('INVALID_POLL_MINUTES');

      const resTooLarge = await request(app)
        .patch(`/api/admin/integrations/keys/${credential.keyId}/settings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expectedPollMinutes: 2000,
        });

      expect(resTooLarge.status).toBe(400);
      expect(resTooLarge.body.code).toBe('INVALID_POLL_MINUTES');
    });
  });
});

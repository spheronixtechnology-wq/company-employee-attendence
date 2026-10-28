const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const StepUpGrant = require('../../src/models/StepUpGrant');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const AuditLog = require('../../src/models/AuditLog');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('PUT /api/admin/integrations/keys/:keyId/scopes (Integration)', () => {
  let adminUser;
  let adminToken;
  let credential;

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

    ({ credential } = await generateCredential({
      name: 'Scope Test Key',
      environment: 'live',
      scopes: ['employees:read', 'attendance-daily:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    }));
  });

  async function getStepUpToken(targetKeyId) {
    const res = await request(app)
      .post('/api/admin/auth/step-up')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'Password@123', operation: 'integration_key:update_scopes', targetKeyId });
    return res.body.data?.token;
  }

  it('1. rejects the update without a step-up token (403 STEP_UP_REQUIRED)', async () => {
    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/scopes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scopes: ['employees:read', 'employees:pii:read'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEP_UP_REQUIRED');
  });

  it('2. invalid scopes return 400 and do NOT consume the grant', async () => {
    const token = await getStepUpToken(credential.keyId);
    const { jti } = jwt.decode(token);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/scopes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', token)
      .send({ scopes: ['employees:read', 'payroll:write'] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SCOPES');
    const grant = await StepUpGrant.findOne({ jti });
    expect(grant.consumedAt).toBeNull();
  });

  it('3. grants the sensitive scopes in place, keeps the secret, and writes an audit entry', async () => {
    const before = await IntegrationCredential.findOne({ keyId: credential.keyId }).lean();
    const token = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/scopes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', token)
      .send({ scopes: ['employees:read', 'employees:pii:read', 'attendance-daily:read', 'attendance-audit:read'] });

    expect(res.status).toBe(200);
    expect(res.body.data.scopes).toEqual([
      'employees:read', 'employees:pii:read', 'attendance-daily:read', 'attendance-audit:read',
    ]);

    const after = await IntegrationCredential.findOne({ keyId: credential.keyId }).lean();
    expect(after.secretHash).toBe(before.secretHash);
    expect(after.keyId).toBe(before.keyId);

    const audit = await AuditLog.findOne({ action: 'INTEGRATION_KEY_SCOPES_UPDATED' }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.added).toEqual(['employees:pii:read', 'attendance-audit:read']);
    expect(audit.metadata.removed).toEqual([]);
  });

  it('4. a step-up token for another key is rejected (403 STEP_UP_TARGET_MISMATCH)', async () => {
    const { credential: other } = await generateCredential({
      name: 'Other Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
    });
    const token = await getStepUpToken(other.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/scopes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', token)
      .send({ scopes: ['employees:read'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEP_UP_TARGET_MISMATCH');
  });

  it('5. revoked keys cannot have scopes changed (400 KEY_NOT_ACTIVE)', async () => {
    await IntegrationCredential.updateOne({ keyId: credential.keyId }, { $set: { status: 'revoked' } });
    const token = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/scopes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', token)
      .send({ scopes: ['employees:read'] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('KEY_NOT_ACTIVE');
  });
});

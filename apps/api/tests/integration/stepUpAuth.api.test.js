const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const StepUpGrant = require('../../src/models/StepUpGrant');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const { generateBase32Secret, generateTOTP } = require('../../src/utils/mfaUtils');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('Step-Up Authentication & requireStepUp (Integration)', () => {
  let adminWithoutMfa;
  let adminWithMfa;
  let adminWithoutMfaToken;
  let adminWithMfaToken;
  let mfaSecretBase32;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearDatabase();

    // Seed admin without MFA
    adminWithoutMfa = await User.create({
      name: 'Standard Admin',
      email: 'admin_nomfa@spheronix.com',
      passwordHash: 'Password@123',
      role: 'admin',
      mfaEnabled: false,
      tokenVersion: 0,
    });

    // Seed admin with MFA enabled
    mfaSecretBase32 = generateBase32Secret(32);
    adminWithMfa = await User.create({
      name: 'MFA Admin',
      email: 'admin_mfa@spheronix.com',
      passwordHash: 'Password@123',
      role: 'admin',
      mfaEnabled: true,
      mfaSecret: mfaSecretBase32,
      tokenVersion: 0,
    });

    // Generate normal session JWT tokens
    adminWithoutMfaToken = jwt.sign(
      { id: adminWithoutMfa._id, role: 'admin', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    adminWithMfaToken = jwt.sign(
      { id: adminWithMfa._id, role: 'admin', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/admin/auth/step-up', () => {
    it('should reject step-up if password is wrong', async () => {
      const res = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'WrongPassword',
          operation: 'integration_key:create',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid credentials/);
    });

    it('should successfully issue step-up token for admin without MFA (password only)', async () => {
      const res = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.mfaUsed).toBe(false);
      expect(res.headers['cache-control']).toMatch(/no-store/);

      // Verify grant was saved in MongoDB
      const grant = await StepUpGrant.findOne({ userId: adminWithoutMfa._id });
      expect(grant).not.toBeNull();
      expect(grant.operation).toBe('integration_key:create');
      expect(grant.consumedAt).toBeNull();
    });

    it('should require 6-digit TOTP code when admin has MFA enabled', async () => {
      // Missing OTP
      const resMissing = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.message).toMatch(/MFA authentication code is required/);

      // Wrong OTP
      const resWrong = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithMfaToken}`)
        .send({
          password: 'Password@123',
          otp: '000000',
          operation: 'integration_key:create',
        });

      expect(resWrong.status).toBe(401);
      expect(resWrong.body.message).toMatch(/Invalid MFA authentication code/);

      // Correct OTP
      const validCode = generateTOTP(mfaSecretBase32);
      const resCorrect = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithMfaToken}`)
        .send({
          password: 'Password@123',
          otp: validCode,
          operation: 'integration_key:create',
        });

      expect(resCorrect.status).toBe(200);
      expect(resCorrect.body.success).toBe(true);
      expect(resCorrect.body.data.mfaUsed).toBe(true);
    });

    it('should pre-validate targetKeyId for rotate and revoke operations', async () => {
      const resMissingTgt = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:rotate',
        });

      expect(resMissingTgt.status).toBe(400);
      expect(resMissingTgt.body.message).toMatch(/targetKeyId is required/);

      const resNotFoundTgt = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:rotate',
          targetKeyId: 'non_existent_key_123',
        });

      expect(resNotFoundTgt.status).toBe(404);
      expect(resNotFoundTgt.body.message).toMatch(/Target integration key not found/);
    });
  });

  describe('requireStepUp Middleware & Grant Consumption', () => {
    it('should reject protected route if X-Step-Up-Token header is missing', async () => {
      const res = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          name: 'ERP Sync Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 90,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
    });

    it('should allow operation with valid step-up token and reject replay attack', async () => {
      // 1. Obtain step-up token
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      const stepUpToken = stepUpRes.body.data.token;

      // 2. Execute protected creation operation
      const createRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'ERP Sync Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 90,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.rawKey).toBeDefined();

      // 3. Replay attack: attempt to use the exact same token again
      const replayRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'ERP Sync Key Replay',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 90,
        });

      expect(replayRes.status).toBe(403);
      expect(replayRes.body.code).toBe('STEP_UP_GRANT_EXPIRED_OR_USED');
    });

    it('should reject token if tokenVersion is stale', async () => {
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      const stepUpToken = stepUpRes.body.data.token;

      // Stale session: increment user tokenVersion in DB and issue refreshed session token
      await User.updateOne({ _id: adminWithoutMfa._id }, { $inc: { tokenVersion: 1 } });
      const refreshedAdminToken = jwt.sign(
        { id: adminWithoutMfa._id, role: 'admin', tokenVersion: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${refreshedAdminToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'ERP Sync Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 90,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STEP_UP_SESSION_STALE');
    });

    it('should reject expired grant even if JWT signature is valid', async () => {
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      const stepUpToken = stepUpRes.body.data.token;
      const decoded = jwt.decode(stepUpToken);

      // Force grant expiry in DB to the past
      await StepUpGrant.updateOne({ jti: decoded.jti }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'ERP Sync Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 90,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STEP_UP_GRANT_EXPIRED_OR_USED');
    });

    it('should not burn step-up grant if request body fails validation', async () => {
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      const stepUpToken = stepUpRes.body.data.token;
      const decoded = jwt.decode(stepUpToken);

      // Send malformed body (missing scopes and expiresInDays)
      const badRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'Incomplete Payload',
        });

      expect(badRes.status).toBe(400);

      // Verify grant was NOT consumed
      const grant = await StepUpGrant.findOne({ jti: decoded.jti });
      expect(grant.consumedAt).toBeNull();

      // Now send valid payload with the same grant -> should succeed!
      const validRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'Complete Payload',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 30,
        });

      expect(validRes.status).toBe(201);
    });

    it('should not burn step-up grant if employee scope validation fails (empty or non-existent IDs)', async () => {
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .send({
          password: 'Password@123',
          operation: 'integration_key:create',
        });

      const stepUpToken = stepUpRes.body.data.token;
      const decoded = jwt.decode(stepUpToken);

      // 1. Try with restricted scope and empty audience
      const emptyAudienceRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'Restricted Key Empty',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 30,
          employeeScope: 'restricted',
          allowedEmployees: [],
        });

      expect(emptyAudienceRes.status).toBe(400);

      // Verify grant was NOT consumed
      let grant = await StepUpGrant.findOne({ jti: decoded.jti });
      expect(grant.consumedAt).toBeNull();

      // 2. Try with fake/non-existent ObjectId
      const fakeId = new mongoose.Types.ObjectId();
      const fakeIdRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'Restricted Key Fake User',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 30,
          employeeScope: 'restricted',
          allowedEmployees: [fakeId],
        });

      expect(fakeIdRes.status).toBe(400);
      expect(fakeIdRes.body.code).toBe('INVALID_EMPLOYEE_IDS');

      // Verify grant is STILL not consumed
      grant = await StepUpGrant.findOne({ jti: decoded.jti });
      expect(grant.consumedAt).toBeNull();

      // 3. Now provide real, active employee with the SAME step-up grant -> must succeed!
      const realEmployee = await User.create({
        name: 'Valid Employee',
        email: 'valid.emp@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
        isActive: true,
      });

      const successRes = await request(app)
        .post('/api/admin/integrations/frappe-hrms/keys')
        .set('Authorization', `Bearer ${adminWithoutMfaToken}`)
        .set('X-Step-Up-Token', stepUpToken)
        .send({
          name: 'Restricted Key Valid User',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 30,
          employeeScope: 'restricted',
          allowedEmployees: [realEmployee._id],
        });

      expect(successRes.status).toBe(201);
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.credential.employeeScope).toBe('restricted');
      expect(successRes.body.data.credential.allowedEmployees).toHaveLength(1);

      // Verify grant is NOW consumed
      grant = await StepUpGrant.findOne({ jti: decoded.jti });
      expect(grant.consumedAt).not.toBeNull();
    });
  });
});

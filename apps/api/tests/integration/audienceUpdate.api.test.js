const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const StepUpGrant = require('../../src/models/StepUpGrant');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const { generateCredential } = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('PUT /api/admin/integrations/keys/:keyId/audience (Integration)', () => {
  let adminUser;
  let adminToken;
  let emp1, emp2, emp3, inactiveEmp, softDeletedEmp;

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

    emp1 = await User.create({
      name: 'Employee One',
      email: 'emp1@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      isActive: true,
    });

    emp2 = await User.create({
      name: 'Employee Two',
      email: 'emp2@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      isActive: true,
    });

    emp3 = await User.create({
      name: 'Employee Three',
      email: 'emp3@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      isActive: true,
    });

    inactiveEmp = await User.create({
      name: 'Inactive Employee',
      email: 'inactive@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      isActive: false,
    });

    softDeletedEmp = await User.create({
      name: 'Soft Deleted Employee',
      email: 'deleted@spheronix.com',
      passwordHash: 'Password@123',
      role: 'employee',
      isActive: true,
      deletedAt: new Date(),
    });
  });

  async function getStepUpToken(targetKeyId) {
    const res = await request(app)
      .post('/api/admin/auth/step-up')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: 'Password@123',
        operation: 'integration_key:update_audience',
        targetKeyId,
      });

    return res.body.data?.token;
  }

  it('1. Updating audience without step-up token returns 403 STEP_UP_REQUIRED', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STEP_UP_REQUIRED');
  });

  it('2. Invalid employee ID format returns 400 INVALID_EMPLOYEE_FORMAT and does NOT consume grant', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    const stepUpToken = await getStepUpToken(credential.keyId);
    const decoded = jwt.decode(stepUpToken);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: ['invalid-not-24-hex'],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMPLOYEE_FORMAT');

    // Grant must remain unconsumed
    const grant = await StepUpGrant.findOne({ jti: decoded.jti });
    expect(grant.consumedAt).toBeNull();
  });

  it('3. Inactive or soft-deleted employee returns 400 INVALID_EMPLOYEE_IDS and does NOT consume grant', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    const stepUpToken = await getStepUpToken(credential.keyId);
    const decoded = jwt.decode(stepUpToken);

    // Test with soft-deleted employee
    const resSoftDel = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, softDeletedEmp._id],
      });

    expect(resSoftDel.status).toBe(400);
    expect(resSoftDel.body.code).toBe('INVALID_EMPLOYEE_IDS');

    let grant = await StepUpGrant.findOne({ jti: decoded.jti });
    expect(grant.consumedAt).toBeNull();

    // Test with inactive employee using same unconsumed grant
    const resInactive = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, inactiveEmp._id],
      });

    expect(resInactive.status).toBe(400);
    expect(resInactive.body.code).toBe('INVALID_EMPLOYEE_IDS');

    grant = await StepUpGrant.findOne({ jti: decoded.jti });
    expect(grant.consumedAt).toBeNull();
  });

  it('4. Empty allowedEmployees on restricted returns 400 EMPTY_ALLOWED_EMPLOYEES', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    const stepUpToken = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_ALLOWED_EMPLOYEES');
  });

  it('5. Invalid employeeScope returns 400 INVALID_EMPLOYEE_SCOPE', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    const stepUpToken = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'custom_invalid',
        allowedEmployees: [emp1._id],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMPLOYEE_SCOPE');
  });

  it('6. Audience expansion (adding an employee) increments audienceVersion by 1 and updates audienceChangedAt', async () => {
    const initialChangedAt = new Date(Date.now() - 3600000);
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
      audienceVersion: 1,
      audienceChangedAt: initialChangedAt,
    });

    const stepUpToken = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.audienceVersion).toBe(2);
    expect(new Date(res.body.data.audienceChangedAt).getTime()).toBeGreaterThan(initialChangedAt.getTime());
    expect(res.body.data.allowedEmployeeCount).toBe(2);

    const updated = await IntegrationCredential.findOne({ keyId: credential.keyId });
    expect(updated.audienceVersion).toBe(2);
    expect(updated.allowedEmployees.map((id) => id.toString())).toContain(emp2._id.toString());
  });

  it('7. Audience reduction (removing an employee) updates allowedEmployees but leaves audienceVersion unchanged', async () => {
    const initialChangedAt = new Date(Date.now() - 3600000);
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id, emp2._id, emp3._id],
      audienceVersion: 3,
      audienceChangedAt: initialChangedAt,
    });

    const stepUpToken = await getStepUpToken(credential.keyId);

    // Remove emp3 (audience reduction)
    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.audienceVersion).toBe(3); // Unchanged!
    expect(new Date(res.body.data.audienceChangedAt).getTime()).toBe(initialChangedAt.getTime()); // Unchanged!
    expect(res.body.data.allowedEmployeeCount).toBe(2);

    const updated = await IntegrationCredential.findOne({ keyId: credential.keyId });
    expect(updated.audienceVersion).toBe(3);
    expect(updated.allowedEmployees.map((id) => id.toString())).not.toContain(emp3._id.toString());
  });

  it('8. Transition from restricted to all increments audienceVersion', async () => {
    const initialChangedAt = new Date(Date.now() - 3600000);
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
      audienceVersion: 2,
      audienceChangedAt: initialChangedAt,
    });

    const stepUpToken = await getStepUpToken(credential.keyId);

    const res = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'all',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.audienceVersion).toBe(3); // Incremented!
    expect(new Date(res.body.data.audienceChangedAt).getTime()).toBeGreaterThan(initialChangedAt.getTime());
    expect(res.body.data.allowedEmployeeCount).toBe('all');

    const updated = await IntegrationCredential.findOne({ keyId: credential.keyId });
    expect(updated.employeeScope).toBe('all');
    expect(updated.allowedEmployees).toEqual([]);
    expect(updated.audienceVersion).toBe(3);
  });

  it('9. Cannot update audience of a key that is revoked or in the middle of rotation', async () => {
    const { credential } = await generateCredential({
      name: 'Audience Test Key',
      environment: 'live',
      scopes: ['employees:read'],
      expiresInDays: 30,
      createdBy: adminUser._id,
      employeeScope: 'restricted',
      allowedEmployees: [emp1._id],
    });

    // Revoke key
    await IntegrationCredential.updateOne({ keyId: credential.keyId }, { $set: { status: 'revoked' } });

    // Step-up token specifically for this key
    const stepUpToken = await getStepUpToken(credential.keyId);

    const resRevoked = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
      });

    expect(resRevoked.status).toBe(400);
    expect(resRevoked.body.code).toBe('KEY_NOT_ACTIVE');

    // Restore to active but simulate active rotationLock
    await IntegrationCredential.updateOne(
      { keyId: credential.keyId },
      {
        $set: {
          status: 'active',
          rotationLock: {
            lockedAt: new Date(),
            lockedBy: adminUser._id,
            lockId: new mongoose.Types.ObjectId(),
          },
        },
      }
    );

    const stepUpToken2 = await getStepUpToken(credential.keyId);

    const resLock = await request(app)
      .put(`/api/admin/integrations/keys/${credential.keyId}/audience`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken2)
      .send({
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
      });

    expect(resLock.status).toBe(409);
    expect(resLock.body.code).toBe('KEY_ROTATION_IN_PROGRESS');
  });
});

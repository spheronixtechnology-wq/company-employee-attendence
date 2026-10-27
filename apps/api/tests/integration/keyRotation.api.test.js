const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const IntegrationCredential = require('../../src/models/IntegrationCredential');
const {
  generateCredential,
  rotateCredential,
} = require('../../src/services/integrationCredential.service');
const { startReplSet, stopReplSet, clearDatabase } = require('../helpers/dbMemoryReplSet');

describe('Key Rotation State Machine & Fault Injection (Integration)', () => {
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
      name: 'Security Admin',
      email: 'secadmin@spheronix.com',
      passwordHash: 'Password@123',
      role: 'admin',
      tokenVersion: 0,
    });
  });

  describe('Normal Rotation', () => {
    it('should keep both keys active during overlap and bound old key expiry', async () => {
      const oldKey = await generateCredential({
        name: 'ERP Sync Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // Normal rotation with 24 hours overlap
      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: false,
        overlapHours: 24,
        adminUser,
      });

      expect(rotated.rawKey).toBeDefined();
      expect(rotated.oldKeyRevoked).toBe(false);
      expect(rotated.oldKeyExpiry).toBeDefined();

      // Test that the new key works immediately on /ping
      const resNew = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${rotated.rawKey}`);
      expect(resNew.status).toBe(200);

      // Test that the old key ALSO works immediately during the overlap window
      const resOld = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${oldKey.rawKey}`);
      expect(resOld.status).toBe(200);

      // Verify old key's expiry is approximately 24 hours from now (not 90 days)
      const updatedOldDoc = await IntegrationCredential.findOne({ keyId: oldKey.credential.keyId });
      expect(updatedOldDoc.rotatedToKeyId).toBe(rotated.credential.keyId);
      const remainingHours = (updatedOldDoc.expiresAt.getTime() - Date.now()) / (3600 * 1000);
      expect(remainingHours).toBeCloseTo(24, 0);
    });

    it('should immediately revoke old key when overlapHours is 0', async () => {
      const oldKey = await generateCredential({
        name: 'ERP Sync Key Zero Overlap',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: false,
        overlapHours: 0,
        adminUser,
      });

      expect(rotated.oldKeyRevoked).toBe(true);

      // New key works
      const resNew = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${rotated.rawKey}`);
      expect(resNew.status).toBe(200);

      // Old key gets 401 immediately
      const resOld = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${oldKey.rawKey}`);
      expect(resOld.status).toBe(401);

      // Verify old key status in DB is explicitly 'revoked' with reason 'rotated'
      const updatedOldDoc = await IntegrationCredential.findOne({ keyId: oldKey.credential.keyId });
      expect(updatedOldDoc.status).toBe('revoked');
      expect(updatedOldDoc.revokeReason).toBe('rotated');
      expect(updatedOldDoc.rotatedToKeyId).toBe(rotated.credential.keyId);
    });
  });

  describe('Compromised Rotation (Fail-Safe Revoke-First)', () => {
    it('should revoke old key first and issue replacement', async () => {
      const oldKey = await generateCredential({
        name: 'Compromised Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: true,
        adminUser,
      });

      expect(rotated.compromised).toBe(true);
      expect(rotated.revokedOldKeyId).toBe(oldKey.credential.keyId);
      expect(rotated.rawKey).toBeDefined();

      // Old key must immediately get 401
      const resOld = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${oldKey.rawKey}`);
      expect(resOld.status).toBe(401);

      // Replacement key works
      const resNew = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${rotated.rawKey}`);
      expect(resNew.status).toBe(200);

      // Check DB audit fields on old key
      const updatedOldDoc = await IntegrationCredential.findOne({ keyId: oldKey.credential.keyId });
      expect(updatedOldDoc.status).toBe('revoked');
      expect(updatedOldDoc.revokeReason).toBe('compromised');
    });

    it('should fail safely if revocation read-back cannot be confirmed (Fault Injection)', async () => {
      const oldKey = await generateCredential({
        name: 'Compromised Key Fault Test',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // Stub updateOne to simulate DB write failure/timeout where status remains active
      const originalUpdateOne = IntegrationCredential.updateOne;
      jest.spyOn(IntegrationCredential, 'updateOne').mockImplementation(async (filter, update) => {
        if (filter.keyId === oldKey.credential.keyId && update.$set?.status === 'revoked') {
          // Simulate failure to write the revocation
          return { modifiedCount: 0 };
        }
        return originalUpdateOne.call(IntegrationCredential, filter, update);
      });

      await expect(
        rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: true,
          adminUser,
        })
      ).rejects.toThrow(/Revocation not confirmed/);

      // Restore updateOne
      IntegrationCredential.updateOne.mockRestore();

      // Verify no replacement key was issued pointing to oldKey
      const replacement = await IntegrationCredential.findOne({ rotatedFromKeyId: oldKey.credential.keyId });
      expect(replacement).toBeNull();
    });

    it('should revoke old key and return KEY_REVOKED_REPLACEMENT_FAILED if replacement generation fails', async () => {
      const oldKey = await generateCredential({
        name: 'Compromised Key Replacement Failure',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // Stub save on IntegrationCredential to fail when creating the replacement key
      jest.spyOn(IntegrationCredential.prototype, 'save').mockImplementationOnce(async function () {
        throw new Error('Database disk full on replacement insert');
      });

      try {
        await rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: true,
          adminUser,
        });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err.code).toBe('KEY_REVOKED_REPLACEMENT_FAILED');
        expect(err.statusCode).toBe(500);
        expect(err.data.revoked).toBe(true);
        expect(err.data.replacementIssued).toBe(false);
        expect(err.data.keyId).toBe(oldKey.credential.keyId);
      } finally {
        IntegrationCredential.prototype.save.mockRestore();
      }

      // Check that the old key was still revoked (remediation succeeded)
      const oldDoc = await IntegrationCredential.findOne({ keyId: oldKey.credential.keyId });
      expect(oldDoc.status).toBe('revoked');
      expect(oldDoc.revokeReason).toBe('compromised');
    });
  });

  describe('Concurrency & Precondition Guards', () => {
    it('should prevent concurrent rotations on the same keyId (Atomic Lock)', async () => {
      const oldKey = await generateCredential({
        name: 'Concurrent Rotation Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // Fire two simultaneous rotation attempts on the exact same keyId
      const results = await Promise.allSettled([
        rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: false,
          overlapHours: 12,
          adminUser,
        }),
        rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: false,
          overlapHours: 12,
          adminUser,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and the other must be rejected
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.statusCode).toBe(409);
    });

    it('should reject rotating a key that was already rotated (No Rotation Chains)', async () => {
      const oldKey = await generateCredential({
        name: 'Chain Prevention Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // First rotation succeeds
      await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: false,
        overlapHours: 24,
        adminUser,
      });

      // Attempting to rotate oldKey again must be rejected with 409
      await expect(
        rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: false,
          overlapHours: 24,
          adminUser,
        })
      ).rejects.toThrow(/Key has already been rotated/);
    });

    it('should reject rotating a key that is revoked or expired', async () => {
      const oldKey = await generateCredential({
        name: 'Revoked Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 90,
        createdBy: adminUser._id,
      });

      // Revoke it first
      await IntegrationCredential.updateOne({ keyId: oldKey.credential.keyId }, { status: 'revoked' });

      await expect(
        rotateCredential({
          oldKeyId: oldKey.credential.keyId,
          compromised: false,
          overlapHours: 24,
          adminUser,
        })
      ).rejects.toThrow(/Cannot rotate an inactive or revoked key/);
    });
  });

  describe('Audience Inheritance across Rotations (RFC-INT-002)', () => {
    it('should preserve employeeScope and allowedEmployees during normal rotation', async () => {
      const emp1 = await User.create({
        name: 'Rotated Emp 1',
        email: 'rot1@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });
      const emp2 = await User.create({
        name: 'Rotated Emp 2',
        email: 'rot2@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });

      const oldKey = await generateCredential({
        name: 'Scoped Key to Rotate',
        environment: 'live',
        scopes: ['employees:read'],
        employeeScope: 'restricted',
        allowedEmployees: [emp1._id, emp2._id],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: false,
        overlapHours: 24,
        adminUser,
      });

      // Replacement key in DB must inherit the audience
      const newCred = await IntegrationCredential.findOne({ keyId: rotated.credential.keyId });
      expect(newCred.employeeScope).toBe('restricted');
      expect(newCred.allowedEmployees).toHaveLength(2);
      expect(newCred.allowedEmployees.map((id) => id.toString())).toContain(emp1._id.toString());
      expect(newCred.allowedEmployees.map((id) => id.toString())).toContain(emp2._id.toString());

      // Ping endpoint verifies metadata
      const res = await request(app)
        .get('/api/integrations/v1/ping')
        .set('Authorization', `Bearer ${rotated.rawKey}`);

      expect(res.status).toBe(200);
      expect(res.body.data.employeeScope).toBe('restricted');
      expect(res.body.data.allowedEmployeeCount).toBe(2);
    });

    it('should preserve employeeScope and allowedEmployees during compromised rotation', async () => {
      const emp = await User.create({
        name: 'Compromised Scoped Emp',
        email: 'comp.scoped@spheronix.com',
        passwordHash: 'Password@123',
        role: 'employee',
      });

      const oldKey = await generateCredential({
        name: 'Compromised Scoped Key',
        environment: 'live',
        scopes: ['employees:read'],
        employeeScope: 'restricted',
        allowedEmployees: [emp._id],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: true,
        adminUser,
      });

      const newCred = await IntegrationCredential.findOne({ keyId: rotated.credential.keyId });
      expect(newCred.employeeScope).toBe('restricted');
      expect(newCred.allowedEmployees).toHaveLength(1);
      expect(newCred.allowedEmployees[0].toString()).toBe(emp._id.toString());
    });

    it('normal rotation preserves audienceVersion, audienceChangedAt and expectedPollMinutes', async () => {
      const fixedDate = new Date('2026-10-20T10:00:00.000Z');
      const oldKey = await generateCredential({
        name: 'Key To Rotate Versioned',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      await IntegrationCredential.updateOne(
        { keyId: oldKey.credential.keyId },
        {
          audienceVersion: 4,
          audienceChangedAt: fixedDate,
          expectedPollMinutes: 15,
        }
      );

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: false,
        overlapHours: 12,
        adminUser,
      });

      const newCred = await IntegrationCredential.findOne({ keyId: rotated.credential.keyId });
      expect(newCred.audienceVersion).toBe(4);
      expect(newCred.audienceChangedAt.toISOString()).toBe(fixedDate.toISOString());
      expect(newCred.expectedPollMinutes).toBe(15);
    });

    it('compromised rotation preserves audienceVersion, audienceChangedAt and expectedPollMinutes', async () => {
      const fixedDate = new Date('2026-10-22T14:30:00.000Z');
      const oldKey = await generateCredential({
        name: 'Compromised Key To Rotate Versioned',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      await IntegrationCredential.updateOne(
        { keyId: oldKey.credential.keyId },
        {
          audienceVersion: 7,
          audienceChangedAt: fixedDate,
          expectedPollMinutes: 30,
        }
      );

      const rotated = await rotateCredential({
        oldKeyId: oldKey.credential.keyId,
        compromised: true,
        adminUser,
      });

      const newCred = await IntegrationCredential.findOne({ keyId: rotated.credential.keyId });
      expect(newCred.audienceVersion).toBe(7);
      expect(newCred.audienceChangedAt.toISOString()).toBe(fixedDate.toISOString());
      expect(newCred.expectedPollMinutes).toBe(30);
    });

    it('new key defaults to audienceVersion 1 and expectedPollMinutes 5', async () => {
      const created = await generateCredential({
        name: 'Default Versioned Key',
        environment: 'live',
        scopes: ['employees:read'],
        expiresInDays: 30,
        createdBy: adminUser._id,
      });

      const cred = await IntegrationCredential.findOne({ keyId: created.credential.keyId });
      expect(cred.audienceVersion).toBe(1);
      expect(cred.expectedPollMinutes).toBe(5);
      expect(cred.audienceChangedAt).toBeDefined();
    });
  });
});

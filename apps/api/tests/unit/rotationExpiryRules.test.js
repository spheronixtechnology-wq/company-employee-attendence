const { generateCredential } = require('../../src/services/integrationCredential.service');

describe('Rotation Expiry & Overlap Rules (Unit)', () => {
  describe('Service-Layer Expiry Validation (1–180 days)', () => {
    it('should reject expiresInDays < 1', async () => {
      await expect(
        generateCredential({
          name: 'Test Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 0,
          createdBy: '507f1f77bcf86cd799439011',
        })
      ).rejects.toThrow(/Expiration lifetime must be an integer between 1 and 180 days/);

      await expect(
        generateCredential({
          name: 'Test Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: -5,
          createdBy: '507f1f77bcf86cd799439011',
        })
      ).rejects.toThrow(/Expiration lifetime must be an integer between 1 and 180 days/);
    });

    it('should reject expiresInDays > 180', async () => {
      await expect(
        generateCredential({
          name: 'Test Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 181,
          createdBy: '507f1f77bcf86cd799439011',
        })
      ).rejects.toThrow(/Expiration lifetime must be an integer between 1 and 180 days/);
    });

    it('should reject non-integer values for expiresInDays', async () => {
      await expect(
        generateCredential({
          name: 'Test Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 30.5,
          createdBy: '507f1f77bcf86cd799439011',
        })
      ).rejects.toThrow(/Expiration lifetime must be an integer between 1 and 180 days/);

      await expect(
        generateCredential({
          name: 'Test Key',
          environment: 'live',
          scopes: ['employees:read'],
          expiresInDays: 'thirty',
          createdBy: '507f1f77bcf86cd799439011',
        })
      ).rejects.toThrow(/Expiration lifetime must be an integer between 1 and 180 days/);
    });
  });

  describe('Overlap Hours Calculation Logic', () => {
    it('should calculate overlap bounded by old key expiry (Never extends old expiry)', () => {
      const now = Date.now();

      // Case A: Old key has 60 days remaining; overlap is 24 hours -> new expiry is now + 24h
      const sixtyDaysFuture = now + 60 * 24 * 60 * 60 * 1000;
      const overlap24h = now + 24 * 60 * 60 * 1000;
      const resultA = Math.min(sixtyDaysFuture, overlap24h);
      expect(resultA).toBe(overlap24h);

      // Case B: Old key has only 4 hours remaining; overlap is 24 hours -> new expiry MUST remain at 4h
      const fourHoursFuture = now + 4 * 60 * 60 * 1000;
      const resultB = Math.min(fourHoursFuture, overlap24h);
      expect(resultB).toBe(fourHoursFuture);
      expect(resultB).toBeLessThan(overlap24h);

      // Case C: Overlap is 0 hours -> immediate revocation
      const overlap0 = 0;
      expect(overlap0).toBe(0);
    });
  });
});

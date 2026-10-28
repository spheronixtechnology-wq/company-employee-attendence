const crypto = require('crypto');
const {
  getPepperMap,
  getCurrentPepper,
  validatePeppersAtStartup,
} = require('../../src/services/integrationCredential.service');

describe('Integration Crypto & Pepper System (Unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Pepper Parsing & Active Pepper Resolution', () => {
    it('should correctly parse multiple pepper versions from environment', () => {
      process.env.INTEGRATION_KEY_PEPPERS = 'v1:pepper_one_123,v2:pepper_two_456,v3:pepper_three_789';
      const peppers = getPepperMap();

      expect(peppers).toEqual({
        v1: 'pepper_one_123',
        v2: 'pepper_two_456',
        v3: 'pepper_three_789',
      });
    });

    it('should ignore empty entries and whitespace', () => {
      process.env.INTEGRATION_KEY_PEPPERS = ' v1 : pepper_one , , v2:pepper_two ';
      const peppers = getPepperMap();

      expect(peppers.v1).toBe('pepper_one');
      expect(peppers.v2).toBe('pepper_two');
    });

    it('should retrieve current pepper according to INTEGRATION_KEY_PEPPER_CURRENT', () => {
      process.env.INTEGRATION_KEY_PEPPERS = 'v1:pepper_one,v2:pepper_two';
      process.env.INTEGRATION_KEY_PEPPER_CURRENT = 'v2';

      const current = getCurrentPepper();
      expect(current.version).toBe('v2');
      expect(current.secret).toBe('pepper_two');
    });

    it('should throw an error if current pepper version is not in peppers map', () => {
      process.env.INTEGRATION_KEY_PEPPERS = 'v1:pepper_one';
      process.env.INTEGRATION_KEY_PEPPER_CURRENT = 'v99';

      expect(() => getCurrentPepper()).toThrow(/Current pepper version "v99" is not defined/);
    });
  });

  describe('HMAC-SHA256 Environment Binding Computation', () => {
    it('should produce identical hashes for identical inputs and different hashes for different environments', () => {
      const pepper = 'secret_pepper_value';
      const keyId = '0123456789abcdef';
      const secret = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      const liveHash = crypto
        .createHmac('sha256', pepper)
        .update(`live.${keyId}.${secret}`)
        .digest('hex');

      const liveHashDuplicate = crypto
        .createHmac('sha256', pepper)
        .update(`live.${keyId}.${secret}`)
        .digest('hex');

      const testHash = crypto
        .createHmac('sha256', pepper)
        .update(`test.${keyId}.${secret}`)
        .digest('hex');

      expect(liveHash).toBe(liveHashDuplicate);
      // Different environments with identical secret and keyId MUST produce different hashes
      expect(liveHash).not.toBe(testHash);
    });

    it('should fail timingSafeEqual comparison if secret is altered by even one bit', () => {
      const pepper = 'test_pepper';
      const keyId = '0123456789abcdef';
      const secret1 = 'a'.repeat(64);
      const secret2 = 'a'.repeat(63) + 'b';

      const hash1 = crypto.createHmac('sha256', pepper).update(`live.${keyId}.${secret1}`).digest();
      const hash2 = crypto.createHmac('sha256', pepper).update(`live.${keyId}.${secret2}`).digest();

      expect(crypto.timingSafeEqual(hash1, hash2)).toBe(false);
    });
  });

  describe('validatePeppersAtStartup', () => {
    it('should fail if INTEGRATION_KEY_PEPPER_CURRENT is missing', async () => {
      delete process.env.INTEGRATION_KEY_PEPPER_CURRENT;
      await expect(validatePeppersAtStartup()).rejects.toThrow(/Current pepper/);
    });

    it('should succeed when peppers are properly configured', async () => {
      process.env.INTEGRATION_KEY_PEPPERS = 'v1:mock_pepper_123';
      process.env.INTEGRATION_KEY_PEPPER_CURRENT = 'v1';

      await expect(validatePeppersAtStartup()).resolves.not.toThrow();
    });
  });
});

const { generateBase32Secret, generateTOTP, verifyTotp } = require('../../src/utils/mfaUtils');

describe('MFA & Cryptography Utilities', () => {
  describe('generateBase32Secret()', () => {
    it('should generate a string of requested length', () => {
      const secret = generateBase32Secret(32);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(32);
    });

    it('should only contain Base32 characters', () => {
      const secret = generateBase32Secret(32);
      // Valid Base32 alphabet: A-Z, 2-7
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });
  });

  describe('TOTP Algorithms (RFC 6238)', () => {
    const fixedSecret = 'JBSWY3DPEHPK3PXP'; // Base32 encoded mock secret

    it('should generate a 6-digit TOTP code', () => {
      const code = generateTOTP(fixedSecret);
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('should generate the exact same TOTP code for the same time window', () => {
      const freezeTime = 1690000000000;
      const code1 = generateTOTP(fixedSecret, 30, freezeTime);
      const code2 = generateTOTP(fixedSecret, 30, freezeTime + 10000); // 10s later (same 30s window)
      expect(code1).toEqual(code2);
    });

    it('should verify a valid TOTP code correctly', () => {
      const now = Date.now();
      const validCode = generateTOTP(fixedSecret, 30, now);
      expect(verifyTotp(validCode, fixedSecret)).toBe(true);
    });

    it('should reject a wrong TOTP code', () => {
      expect(verifyTotp('000000', fixedSecret)).toBe(false);
    });

    it('should reject malformed or short TOTP codes', () => {
      expect(verifyTotp('123', fixedSecret)).toBe(false);
      expect(verifyTotp('1234567', fixedSecret)).toBe(false);
      expect(verifyTotp('abcdef', fixedSecret)).toBe(false);
    });

    it('should accept a slightly drifted TOTP code (within 1 timeStep window)', () => {
      const pastTime = Date.now() - 25000; // 25 seconds ago
      const oldCode = generateTOTP(fixedSecret, 30, pastTime);
      
      // Verification allows for a drift of +/- 1 window (30s)
      expect(verifyTotp(oldCode, fixedSecret)).toBe(true);
    });
  });
});

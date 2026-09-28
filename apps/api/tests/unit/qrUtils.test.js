const crypto = require('crypto');
const { generateOfficeQrPayload, verifyOfficeQrPayload } = require('../../src/utils/qrUtils');

describe('QR Utilities (HMAC-SHA256)', () => {
  const dummyOfficeId = '64a7c9f8e4b0c1234567890a';
  
  beforeAll(() => {
    // Mock the environment variable for testing
    process.env.OFFICE_QR_SECRET = 'TEST_SECRET_KEY_123';
  });

  describe('generateOfficeQrPayload()', () => {
    it('should generate a valid QR string with required fields', () => {
      const { payload } = generateOfficeQrPayload({ officeId: dummyOfficeId, validityMinutes: 5 });
      
      expect(payload.type).toBe('OFFICE_QR');
      expect(payload.officeId).toBe(dummyOfficeId);
      expect(payload.issuedAt).toBeDefined();
      expect(payload.expiresAt).toBeGreaterThan(payload.issuedAt);
      expect(payload.nonce).toBeDefined();
      expect(payload.sig).toBeDefined();
      expect(payload.sig.length).toBe(64); // SHA256 hex string length
    });
  });

  describe('verifyOfficeQrPayload()', () => {
    it('should successfully verify a freshly generated QR payload', () => {
      const { qrString } = generateOfficeQrPayload({ officeId: dummyOfficeId, validityMinutes: 5 });
      const verification = verifyOfficeQrPayload(qrString);
      
      expect(verification.valid).toBe(true);
      expect(verification.payload.officeId).toBe(dummyOfficeId);
    });

    it('should reject a QR code if the signature is altered (Tamper Test)', () => {
      const { payload } = generateOfficeQrPayload({ officeId: dummyOfficeId, validityMinutes: 5 });
      
      // Tamper with the signature
      payload.sig = 'a' + payload.sig.slice(1); 
      const tamperedQrString = JSON.stringify(payload);
      
      const verification = verifyOfficeQrPayload(tamperedQrString);
      
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('Cryptographic signature verification failed');
    });

    it('should reject a QR code if the officeId is altered (Spoofing Test)', () => {
      const { payload } = generateOfficeQrPayload({ officeId: dummyOfficeId, validityMinutes: 5 });
      
      // Tamper with the officeId without updating the signature
      payload.officeId = '64a7c9f8e4b0c1234567890b'; 
      const tamperedQrString = JSON.stringify(payload);
      
      const verification = verifyOfficeQrPayload(tamperedQrString);
      
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('Cryptographic signature verification failed');
    });

    it('should reject an expired QR code', () => {
      const { payload } = generateOfficeQrPayload({ officeId: dummyOfficeId, validityMinutes: -5 }); // Expired 5 mins ago
      
      // We must regenerate the signature since we modified the expiration manually for the test
      // Actually, passing negative validity Minutes already handles it.
      const qrString = JSON.stringify(payload);
      const verification = verifyOfficeQrPayload(qrString);
      
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('Office QR code has expired. Please scan the current code.');
    });

    it('should reject malformed JSON', () => {
      const verification = verifyOfficeQrPayload('not-json');
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('QR code data is not valid JSON.');
    });
  });
});

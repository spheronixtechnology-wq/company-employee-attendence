const { signCursor, verifyAndDecodeCursor } = require('../../src/utils/cursorUtils');

describe('Cursor HMAC Signing & Verification (Unit)', () => {
  const secret = 'test-secret-pepper-32-chars-long!';
  const payload = {
    tenant: 'cust_01',
    ep: 'attendance',
    wm: '2026-10-24T16:00:00.000Z',
    u: '2026-10-24T08:30:00.000Z',
    id: '671a5c4d00123456789abcde',
  };

  it('should successfully sign and verify a valid cursor', () => {
    const rawCursor = signCursor(payload, secret);
    expect(typeof rawCursor).toBe('string');
    expect(rawCursor).toContain('.');

    const decoded = verifyAndDecodeCursor(rawCursor, secret);
    expect(decoded).toEqual(expect.objectContaining(payload));
    expect(decoded.v).toBe(1);
    expect(typeof decoded.exp).toBe('number');
    expect(decoded.exp).toBeGreaterThan(Date.now());
  });

  it('should reject a cursor that has expired', () => {
    // Generate an expired cursor (1 hour in the past)
    const expiredPayload = {
      ...payload,
      exp: Date.now() - 3600 * 1000,
    };
    const rawCursor = signCursor(expiredPayload, secret);
    const decoded = verifyAndDecodeCursor(rawCursor, secret);
    expect(decoded).toBeNull();
  });

  it('should reject a cursor with missing, non-numeric, or non-finite exp', () => {
    const crypto = require('crypto');

    // Tampered payload missing exp
    const noExpPayload = { ...payload };
    delete noExpPayload.exp;
    const b64NoExp = Buffer.from(JSON.stringify(noExpPayload), 'utf8').toString('base64url');
    const sigNoExp = crypto.createHmac('sha256', secret).update(b64NoExp).digest('hex');
    expect(verifyAndDecodeCursor(`${b64NoExp}.${sigNoExp}`, secret)).toBeNull();

    // Tampered payload with string exp
    const stringExpPayload = { ...payload, exp: '2027-01-01' };
    const b64StringExp = Buffer.from(JSON.stringify(stringExpPayload), 'utf8').toString('base64url');
    const sigStringExp = crypto.createHmac('sha256', secret).update(b64StringExp).digest('hex');
    expect(verifyAndDecodeCursor(`${b64StringExp}.${sigStringExp}`, secret)).toBeNull();

    // Tampered payload with NaN exp
    const nanExpPayload = { ...payload, exp: null };
    const b64NanExp = Buffer.from(JSON.stringify(nanExpPayload), 'utf8').toString('base64url');
    const sigNanExp = crypto.createHmac('sha256', secret).update(b64NanExp).digest('hex');
    expect(verifyAndDecodeCursor(`${b64NanExp}.${sigNanExp}`, secret)).toBeNull();
  });

  it('should reject a tampered payload', () => {
    const rawCursor = signCursor(payload, secret);
    const [payloadB64, sig] = rawCursor.split('.');

    // Tamper with payload by modifying a character
    const tamperedPayloadB64 = payloadB64.slice(0, -1) + (payloadB64.endsWith('a') ? 'b' : 'a');
    const tamperedCursor = `${tamperedPayloadB64}.${sig}`;

    const decoded = verifyAndDecodeCursor(tamperedCursor, secret);
    expect(decoded).toBeNull();
  });

  it('should reject a tampered signature', () => {
    const rawCursor = signCursor(payload, secret);
    const [payloadB64, sig] = rawCursor.split('.');

    // Flip last character of hex signature
    const flippedChar = sig.endsWith('0') ? '1' : '0';
    const tamperedSig = sig.slice(0, -1) + flippedChar;
    const tamperedCursor = `${payloadB64}.${tamperedSig}`;

    const decoded = verifyAndDecodeCursor(tamperedCursor, secret);
    expect(decoded).toBeNull();
  });

  it('should reject verification with a different secret', () => {
    const rawCursor = signCursor(payload, secret);
    const decoded = verifyAndDecodeCursor(rawCursor, 'different-secret-pepper-999');
    expect(decoded).toBeNull();
  });

  it('should return null for malformed or non-string inputs', () => {
    expect(verifyAndDecodeCursor(null, secret)).toBeNull();
    expect(verifyAndDecodeCursor('', secret)).toBeNull();
    expect(verifyAndDecodeCursor('no-dot-here', secret)).toBeNull();
    expect(verifyAndDecodeCursor('too.many.dots.here', secret)).toBeNull();
    expect(verifyAndDecodeCursor(12345, secret)).toBeNull();
  });
});

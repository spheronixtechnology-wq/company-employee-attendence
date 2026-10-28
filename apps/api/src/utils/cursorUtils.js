const crypto = require('crypto');

/**
 * Encodes and cryptographically signs a cursor payload using HMAC-SHA256.
 *
 * @param {Object} payload - Cursor data { tenant, ep, wm, u, id }
 * @param {string} secret - Cryptographic secret/pepper
 * @returns {string} URL-safe signed cursor string
 */
function signCursor(payload, secret) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a valid object');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret is required for signing cursors');
  }

  const fullPayload = {
    v: 1,
    exp: typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp
      : Date.now() + 24 * 60 * 60 * 1000,
    ...payload,
  };

  const jsonStr = JSON.stringify(fullPayload);
  const payloadB64 = Buffer.from(jsonStr, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a signed cursor.
 * Performs timing-safe comparison of HMAC signature and mandatory fail-closed expiration check.
 *
 * @param {string} rawCursor - The cursor string to verify
 * @param {string} secret - Cryptographic secret/pepper
 * @returns {Object|null} Decoded payload if valid and unexpired, otherwise null
 */
function verifyAndDecodeCursor(rawCursor, secret) {
  if (!rawCursor || typeof rawCursor !== 'string') {
    return null;
  }
  if (!secret || typeof secret !== 'string') {
    return null;
  }

  const parts = rawCursor.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) {
    return null;
  }

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const decoded = JSON.parse(jsonStr);

    // Mandatory fail-closed expiration check: exp must be a finite number and strictly in the future
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || Date.now() > decoded.exp) {
      return null;
    }

    return decoded;
  } catch (err) {
    return null;
  }
}

module.exports = {
  signCursor,
  verifyAndDecodeCursor,
};

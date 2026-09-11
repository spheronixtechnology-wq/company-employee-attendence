const crypto = require('crypto');

/**
 * Builds the canonical JSON string for Office QR signing.
 * Strictly maintains consistent property keys and ordering.
 */
const buildCanonicalString = ({ type, officeId, issuedAt, expiresAt, nonce }) => {
  return JSON.stringify({
    type,
    officeId,
    issuedAt,
    expiresAt,
    nonce,
  });
};

/**
 * Retrieves the dedicated Office QR secret key.
 */
const getOfficeQrSecret = () => {
  const secret = process.env.OFFICE_QR_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('OFFICE_QR_SECRET is not configured.');
  }
  return secret;
};

/**
 * Generates an HMAC-SHA256 signed Office QR payload.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.officeId - The ID of the authorized office
 * @param {number} [options.validityMinutes=5] - Validity duration in minutes
 * @returns {{ qrString: string, payload: Object }}
 */
const generateOfficeQrPayload = ({ officeId, validityMinutes = 5 }) => {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + validityMinutes * 60 * 1000;
  const nonce = crypto.randomBytes(8).toString('hex');
  const officeIdStr = String(officeId);

  const canonical = buildCanonicalString({
    type: 'OFFICE_QR',
    officeId: officeIdStr,
    issuedAt,
    expiresAt,
    nonce,
  });

  const sig = crypto
    .createHmac('sha256', getOfficeQrSecret())
    .update(canonical)
    .digest('hex');

  const qrPayload = {
    type: 'OFFICE_QR',
    officeId: officeIdStr,
    issuedAt,
    expiresAt,
    nonce,
    sig,
  };

  return {
    qrString: JSON.stringify(qrPayload),
    payload: qrPayload,
  };
};

/**
 * Authoritatively verifies an incoming Office QR string.
 *
 * Checks:
 * 1. Valid JSON format
 * 2. type === 'OFFICE_QR'
 * 3. Required officeId, issuedAt, expiresAt, and nonce
 * 4. Numeric expiration and validity window (not expired)
 * 5. Signature format and exact 64-hex length guard
 * 6. Cryptographic timing-safe comparison of HMAC signature
 *
 * @param {string} qrString - The decoded QR text from the client
 * @returns {{ valid: boolean, payload?: Object, reason?: string }}
 */
const verifyOfficeQrPayload = (qrString) => {
  if (!qrString || typeof qrString !== 'string') {
    return { valid: false, reason: 'Missing or invalid QR data.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(qrString);
  } catch {
    return { valid: false, reason: 'QR code data is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'Malformed QR code format.' };
  }

  if (parsed.type !== 'OFFICE_QR') {
    return { valid: false, reason: 'Not an authorized Office QR code.' };
  }

  if (!parsed.officeId || typeof parsed.officeId !== 'string') {
    return { valid: false, reason: 'Invalid office identifier in QR code.' };
  }

  if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) {
    return { valid: false, reason: 'Invalid expiration timestamp in QR code.' };
  }

  if (Date.now() > parsed.expiresAt) {
    return { valid: false, reason: 'Office QR code has expired. Please scan the current code.' };
  }

  if (typeof parsed.issuedAt !== 'number' || !Number.isFinite(parsed.issuedAt)) {
    return { valid: false, reason: 'Invalid issue timestamp in QR code.' };
  }

  if (!parsed.nonce || typeof parsed.nonce !== 'string') {
    return { valid: false, reason: 'Invalid security nonce in QR code.' };
  }

  // Strict signature length check before timingSafeEqual (prevents exceptions on length mismatch)
  if (typeof parsed.sig !== 'string' || parsed.sig.length !== 64) {
    return { valid: false, reason: 'Invalid cryptographic signature format.' };
  }

  // Recompute canonical HMAC
  const canonical = buildCanonicalString({
    type: parsed.type,
    officeId: parsed.officeId,
    issuedAt: parsed.issuedAt,
    expiresAt: parsed.expiresAt,
    nonce: parsed.nonce,
  });

  let expectedSig;
  try {
    expectedSig = crypto
      .createHmac('sha256', getOfficeQrSecret())
      .update(canonical)
      .digest('hex');
  } catch (err) {
    return { valid: false, reason: 'HMAC verification computation failed.' };
  }

  if (expectedSig.length !== 64) {
    return { valid: false, reason: 'Unexpected signature length.' };
  }

  const sigBuffer = Buffer.from(parsed.sig, 'hex');
  const expectedBuffer = Buffer.from(expectedSig, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'Signature mismatch.' };
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Cryptographic signature verification failed.' };
  }

  return {
    valid: true,
    payload: parsed,
  };
};

/**
 * Server-side short-lived active QR token cache (Option B).
 *
 * Ensures token consistency between the desktop display and scanning employees.
 * Reuses the currently active QR token until it is within 30 seconds of expiration.
 *
 * Cache Map: officeIdStr -> { qrString, payload, expiresAt }
 */
const activeOfficeQrCache = new Map();

const getActiveOfficeQr = (officeId, validityMinutes = 5) => {
  const officeIdStr = String(officeId);
  const existing = activeOfficeQrCache.get(officeIdStr);

  const now = Date.now();
  // Reuse existing if active and more than 30 seconds remaining
  if (existing && existing.expiresAt - now > 30 * 1000) {
    return existing;
  }

  const generated = generateOfficeQrPayload({ officeId: officeIdStr, validityMinutes });
  const tokenRecord = {
    qrString: generated.qrString,
    payload: generated.payload,
    expiresAt: generated.payload.expiresAt,
  };

  activeOfficeQrCache.set(officeIdStr, tokenRecord);
  return tokenRecord;
};

module.exports = {
  buildCanonicalString,
  generateOfficeQrPayload,
  verifyOfficeQrPayload,
  getActiveOfficeQr,
};

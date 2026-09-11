const crypto = require('crypto');
const QRCode = require('qrcode');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a random RFC 4648 Base32 secret string.
 * Default 32 characters (160 bits of entropy) formatted for Authenticator apps.
 */
function generateBase32Secret(charLength = 32) {
  const randomBytes = crypto.randomBytes(charLength);
  let secret = '';
  for (let i = 0; i < charLength; i++) {
    secret += BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return secret;
}

/**
 * Decodes a Base32 string into a Buffer.
 */
function base32Decode(base32) {
  if (!base32 || typeof base32 !== 'string') return Buffer.alloc(0);
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Computes a standard 6-digit TOTP code for a given timestamp (RFC 6238).
 */
function generateTOTP(secretBase32, timeStep = 30, forTime = Date.now()) {
  const counter = Math.floor(forTime / 1000 / timeStep);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);
  const key = base32Decode(secretBase32);
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with time drift window tolerance (RFC 6238).
 * window = 1 allows +/- 30s drift (covers past 30s, current 30s, next 30s).
 */
function verifyTotp(token, secretBase32, window = 1, timeStep = 30) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;
  if (!secretBase32) return false;

  const now = Date.now();
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const checkTime = now + (errorWindow * timeStep * 1000);
    const expected = generateTOTP(secretBase32, timeStep, checkTime);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

/**
 * Generates standard otpauth URI for Authenticator apps.
 */
function generateOtpauthUri(email, secret, issuer = 'Spheronix') {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates base64 PNG data URL for displaying QR code in the browser.
 */
async function generateQrCodeDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

module.exports = {
  generateBase32Secret,
  generateTOTP,
  verifyTotp,
  generateOtpauthUri,
  generateQrCodeDataUrl,
};

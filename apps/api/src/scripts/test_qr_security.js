require('dotenv').config();
const {
  generateOfficeQrPayload,
  verifyOfficeQrPayload,
  getActiveOfficeQr,
  buildCanonicalString,
} = require('../utils/qrUtils');
const assert = require('assert');

async function runTests() {
  console.log('🧪 Starting Office QR Cryptographic & Validation Test Suite...\n');

  // Test 1: Canonical Signing & Structure
  console.log('Test 1: Canonical Signing & Structure');
  const testOfficeId = '6a96bff127f5fdcb4633fc52';
  const { qrString, payload } = generateOfficeQrPayload({ officeId: testOfficeId, validityMinutes: 5 });
  
  assert.strictEqual(payload.type, 'OFFICE_QR');
  assert.strictEqual(payload.officeId, testOfficeId);
  assert.strictEqual(typeof payload.issuedAt, 'number');
  assert.strictEqual(typeof payload.expiresAt, 'number');
  assert.strictEqual(typeof payload.nonce, 'string');
  assert.strictEqual(typeof payload.sig, 'string');
  assert.strictEqual(payload.sig.length, 64, 'HMAC SHA256 must be 64 hex characters');
  console.log('✅ Generated QR is valid JSON with 64-char hex HMAC signature.');

  // Test 2: Successful Verification
  console.log('\nTest 2: Verification of Unaltered Office QR');
  const resultValid = verifyOfficeQrPayload(qrString);
  assert.strictEqual(resultValid.valid, true);
  assert.strictEqual(resultValid.payload.officeId, testOfficeId);
  console.log('✅ Unaltered Office QR successfully verified.');

  // Test 3: Tampering - Modified officeId
  console.log('\nTest 3: Tampering - Modified officeId');
  const tamperedPayload1 = { ...payload, officeId: 'evil_office_id' };
  const resultTampered1 = verifyOfficeQrPayload(JSON.stringify(tamperedPayload1));
  assert.strictEqual(resultTampered1.valid, false);
  console.log('✅ Tampered officeId rejected as expected.');

  // Test 4: Tampering - Modified expiresAt
  console.log('\nTest 4: Tampering - Modified expiresAt');
  const tamperedPayload2 = { ...payload, expiresAt: payload.expiresAt + 100000 };
  const resultTampered2 = verifyOfficeQrPayload(JSON.stringify(tamperedPayload2));
  assert.strictEqual(resultTampered2.valid, false);
  console.log('✅ Tampered expiration timestamp rejected as expected.');

  // Test 5: Expiration
  console.log('\nTest 5: Expired Token Rejection');
  const expiredPayload = {
    type: 'OFFICE_QR',
    officeId: testOfficeId,
    issuedAt: Date.now() - 600000,
    expiresAt: Date.now() - 1000, // Expired 1 second ago
    nonce: '12345678abcdef01',
  };
  const canonicalExpired = buildCanonicalString(expiredPayload);
  const crypto = require('crypto');
  const secret = process.env.OFFICE_QR_SECRET || process.env.JWT_SECRET;
  expiredPayload.sig = crypto.createHmac('sha256', secret).update(canonicalExpired).digest('hex');
  const resultExpired = verifyOfficeQrPayload(JSON.stringify(expiredPayload));
  assert.strictEqual(resultExpired.valid, false);
  assert(resultExpired.reason.includes('expired'), 'Reason should mention expiration');
  console.log('✅ Expired token rejected:', resultExpired.reason);

  // Test 6: Safe Length-Mismatch Protection (timingSafeEqual guard)
  console.log('\nTest 6: Safe Length-Mismatch Protection');
  const badSigs = ['', 'abc', '123', null, undefined, 'f'.repeat(63), 'f'.repeat(65)];
  for (const badSig of badSigs) {
    const badSigPayload = { ...payload, sig: badSig };
    const res = verifyOfficeQrPayload(JSON.stringify(badSigPayload));
    assert.strictEqual(res.valid, false);
  }
  console.log('✅ All non-64-length signatures safely rejected without throwing exceptions.');

  // Test 7: Foreign QR code rejection
  console.log('\nTest 7: Foreign Barcode & Non-Office QR Rejection');
  const foreignInputs = [
    'OFFICE_QR_DEFAULT',
    'https://example.com/login',
    'WIFI:T:WPA;S:MyNetwork;P:MyPassword;;',
    JSON.stringify({ type: 'CHECKOUT_QR', token: 'abcd1234efgh5678' }),
    JSON.stringify({ type: 'RANDOM', data: 123 }),
    'random string',
    '{}',
    '',
  ];
  for (const input of foreignInputs) {
    const res = verifyOfficeQrPayload(input);
    assert.strictEqual(res.valid, false);
  }
  console.log('✅ All foreign inputs (legacy string, URLs, WiFi, Checkout tokens) rejected.');

  // Test 8: Active Token Cache (Option B consistency)
  console.log('\nTest 8: Server-side Active Token Cache');
  const token1 = getActiveOfficeQr(testOfficeId, 5);
  const token2 = getActiveOfficeQr(testOfficeId, 5);
  assert.strictEqual(token1.qrString, token2.qrString, 'Consecutive calls within 5m must return same token');
  assert.strictEqual(token1.expiresAt, token2.expiresAt);
  console.log('✅ Consecutive calls within validity window returned identical active token.');

  console.log('\n🎉 ALL 8 TESTS PASSED SUCCESSFULLY! Cryptographic QR security verified.\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

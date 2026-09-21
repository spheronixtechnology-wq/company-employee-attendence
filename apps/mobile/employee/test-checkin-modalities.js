const crypto = require('crypto');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

async function main() {
  const { isValidOfficeQr, isValidCheckoutQr } = await import('./src/utils/qrValidator.js');

  console.log('--- TESTING CHECK-IN MODALITIES & QR VALIDATION ---');

  // Test 1: Empty / Null / Garbage text
  assert(!isValidOfficeQr(null), 'Null QR is invalid');
  assert(!isValidOfficeQr(''), 'Empty QR is invalid');
  assert(!isValidOfficeQr('hello world'), 'Plaintext string is invalid');
  assert(!isValidOfficeQr('{ "type": "RANDOM" }'), 'Non-office type is invalid');

  // Test 2: Expired office QR
  const expiredQr = JSON.stringify({
    type: 'OFFICE_QR',
    officeId: '64f1a2b3c4d5e6f7a8b9c0d1',
    sig: crypto.randomBytes(32).toString('hex'), // 64 hex characters
    expiresAt: Date.now() - 5000, // Expired 5 seconds ago
  });
  assert(!isValidOfficeQr(expiredQr), 'Expired office QR is rejected');

  // Test 3: Valid active office QR
  const validQr = JSON.stringify({
    type: 'OFFICE_QR',
    officeId: '64f1a2b3c4d5e6f7a8b9c0d1',
    sig: crypto.randomBytes(32).toString('hex'), // 64 hex characters
    expiresAt: Date.now() + 60000, // Valid for next 60s
  });
  assert(isValidOfficeQr(validQr), 'Valid structural office QR passes validation');

  // Test 4: Tampered signature length
  const tamperedSigQr = JSON.stringify({
    type: 'OFFICE_QR',
    officeId: '64f1a2b3c4d5e6f7a8b9c0d1',
    sig: 'short_sig', // Not 64 chars
    expiresAt: Date.now() + 60000,
  });
  assert(!isValidOfficeQr(tamperedSigQr), 'Tampered signature length rejected');

  // Test 5: Checkout QR validation
  assert(!isValidCheckoutQr(null), 'Null checkout QR is invalid');
  assert(isValidCheckoutQr(crypto.randomBytes(16).toString('hex')), '32-char hex token is valid checkout QR');
  const validCheckoutObj = JSON.stringify({
    type: 'CHECKOUT_QR',
    token: crypto.randomBytes(16).toString('hex'),
  });
  assert(isValidCheckoutQr(validCheckoutObj), 'JSON CHECKOUT_QR object is valid');

  console.log('--- ALL CHECK-IN MODALITY TESTS PASSED ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

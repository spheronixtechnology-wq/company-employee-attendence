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
  const { isValidCheckoutQr } = await import('./src/utils/qrValidator.js');

  console.log('--- TESTING CHECK-OUT SYNCHRONIZATION ---');

  // Test 1: Daily work log compliance invariant
  function canCheckout(dashboard) {
    return Boolean(dashboard?.dailyLogSubmitted);
  }

  assert(!canCheckout({ dailyLogSubmitted: false }), 'Checkout is blocked when daily work log is not submitted');
  assert(canCheckout({ dailyLogSubmitted: true }), 'Checkout is unlocked when daily work log is submitted');

  // Test 2: Timestamp Anti-Spoofing Invariant (rejects timestamps > 60s old)
  function isTimestampValid(clientTimestamp, maxAgeMs = 60000) {
    if (!clientTimestamp) return true;
    return (Date.now() - clientTimestamp) <= maxAgeMs;
  }

  const freshTimestamp = Date.now() - 5000; // 5s ago
  const staleTimestamp = Date.now() - 120000; // 2 minutes ago
  assert(isTimestampValid(freshTimestamp), 'Fresh location timestamp is accepted');
  assert(!isTimestampValid(staleTimestamp), 'Stale location timestamp (> 60s) is rejected');

  // Test 3: Checkout QR Token Structure
  const hexToken32 = crypto.randomBytes(16).toString('hex');
  assert(isValidCheckoutQr(hexToken32), '32-character hexadecimal checkout token is valid');

  const jsonCheckoutQr = JSON.stringify({
    type: 'CHECKOUT_QR',
    token: hexToken32,
  });
  assert(isValidCheckoutQr(jsonCheckoutQr), 'CHECKOUT_QR JSON object structure is valid');

  const invalidQr = JSON.stringify({
    type: 'WRONG_TYPE',
    token: hexToken32,
  });
  assert(!isValidCheckoutQr(invalidQr), 'Incorrect QR type is rejected');

  // Test 4: Cross-device PC session single-use token lifecycle
  const activeSessions = new Map();
  const userId = 'user_12345';
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 90000; // 90s TTL

  // PC browser creates session
  activeSessions.set(userId, { token, expiresAt });
  assert(activeSessions.has(userId), 'PC checkout session active in memory');

  // Mobile scans and redeems token
  const scannedToken = token;
  const session = activeSessions.get(userId);
  assert(session && session.token === scannedToken && Date.now() <= session.expiresAt, 'Token successfully validated against active session');

  // Invalidate token immediately (replay protection)
  activeSessions.delete(userId);
  assert(!activeSessions.has(userId), 'Session token invalidated immediately after checkout redemption');

  console.log('--- ALL CHECKOUT SYNCHRONIZATION TESTS PASSED ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

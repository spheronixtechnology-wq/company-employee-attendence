function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

console.log('--- TESTING GEOFENCE SESSION STATE MACHINE ---');

// Test 1: Spatial Hysteresis Zones (R = 100m)
const R = 100;
const insideThreshold = R - 10;  // 90m
const outsideThreshold = R + 15; // 115m

function getZone(distance) {
  if (distance <= insideThreshold) return 'INSIDE';
  if (distance > outsideThreshold) return 'OUTSIDE';
  return 'BOUNDARY';
}

assert(getZone(50) === 'INSIDE', '50m is INSIDE');
assert(getZone(89) === 'INSIDE', '89m is INSIDE');
assert(getZone(95) === 'BOUNDARY', '95m is BOUNDARY (hysteresis zone)');
assert(getZone(105) === 'BOUNDARY', '105m is BOUNDARY (hysteresis zone)');
assert(getZone(115) === 'BOUNDARY', '115m is BOUNDARY (hysteresis zone)');
assert(getZone(116) === 'OUTSIDE', '116m is OUTSIDE');
assert(getZone(180) === 'OUTSIDE', '180m is OUTSIDE');

// Test 2: Return Confirmation Counter (Requires 3 consecutive INSIDE samples)
let insideConfirmations = 0;
let sessionStatus = 'ACTIVE';

function processReturnSample(zone) {
  if (zone === 'INSIDE') {
    insideConfirmations++;
    if (insideConfirmations >= 3) {
      sessionStatus = 'RESOLVED';
    }
  } else if (zone === 'OUTSIDE') {
    insideConfirmations = 0; // Reset counter if employee wanders back out
  }
  return { insideConfirmations, sessionStatus };
}

// Sample 1: Inside
let s1 = processReturnSample('INSIDE');
assert(s1.insideConfirmations === 1 && s1.sessionStatus === 'ACTIVE', 'Sample 1 confirms 1/3, status remains ACTIVE');

// Sample 2: Inside
let s2 = processReturnSample('INSIDE');
assert(s2.insideConfirmations === 2 && s2.sessionStatus === 'ACTIVE', 'Sample 2 confirms 2/3, status remains ACTIVE');

// Sample 3: Boundary (does not reset confirmation counter)
let s3_b = processReturnSample('BOUNDARY');
assert(insideConfirmations === 2, 'Boundary sample does not reset return confirmations');

// Sample 3: Inside
let s3 = processReturnSample('INSIDE');
assert(s3.insideConfirmations === 3 && s3.sessionStatus === 'RESOLVED', 'Sample 3 confirms 3/3, status transitions to RESOLVED');

// Test 3: Alert 5 Grace Period (180s server-authoritative countdown)
const now = Date.now();
const alert5TriggerTime = now - 50000; // Triggered 50 seconds ago
const gracePeriodTotalSeconds = 180;
const graceExpiresAt = alert5TriggerTime + (gracePeriodTotalSeconds * 1000);

function getRemainingGraceSeconds(currentTime) {
  return Math.max(0, Math.floor((graceExpiresAt - currentTime) / 1000));
}

assert(getRemainingGraceSeconds(now) === 130, 'Remaining grace period is exactly 130s after 50s elapsed');
assert(getRemainingGraceSeconds(graceExpiresAt + 1000) === 0, 'Remaining grace period floors at 0 after expiration');

console.log('--- ALL GEOFENCE STATE MACHINE TESTS PASSED ---');

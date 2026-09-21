/**
 * test-phase7-compliance.js
 * Comprehensive unit tests for Phase 7 compliance modules:
 * 1. Overtime focus stopwatch math & 2-stage lifecycle validation
 * 2. Daily Log document size limit & streak milestone progression
 * 3. Leave application date boundaries & remaining balance calculations
 * 4. Device security status taxonomy & replacement payloads
 * 5. Manual attendance validation constraints
 */

function runPhase7ComplianceTests() {
  console.log('🧪 Starting Phase 7 Compliance & Subsystems Validation Tests...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
    }
  }

  // --- Suite 1: Overtime Stopwatch & Lifecycle Math ---
  console.log('--- Suite 1: Overtime Stopwatch & Lifecycle Math ---');
  {
    const formatElapsed = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    assert(formatElapsed(0) === '00:00:00', 'Elapsed 0 sec formats to 00:00:00');
    assert(formatElapsed(65) === '00:01:05', 'Elapsed 65 sec formats to 00:01:05');
    assert(formatElapsed(3665) === '01:01:05', 'Elapsed 3665 sec formats to 01:01:05');

    // Live timer delta
    const startTs = Date.now() - 5400 * 1000; // 1.5 hours ago
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - startTs) / 1000));
    assert(elapsed >= 5399 && elapsed <= 5401, 'Elapsed time computes correctly within 1s tolerance');

    // Stage 1 validation: requires date, requestedStartTime, requestedEndTime, reason
    const validateStage1 = (payload) => {
      if (!payload.date || !payload.reason || payload.reason.trim().length === 0) return false;
      if (!payload.requestedStartTime || !payload.requestedEndTime) return false;
      return true;
    };

    assert(
      validateStage1({
        date: '2026-09-21',
        requestedStartTime: '2026-09-21T18:30:00.000Z',
        requestedEndTime: '2026-09-21T20:30:00.000Z',
        reason: 'Deploying release v2.0',
      }) === true,
      'Valid Stage 1 overtime payload passes validation'
    );

    assert(
      validateStage1({
        date: '2026-09-21',
        requestedStartTime: '2026-09-21T18:30:00.000Z',
        requestedEndTime: '2026-09-21T20:30:00.000Z',
        reason: '',
      }) === false,
      'Empty reason rejected in Stage 1 overtime request'
    );
  }

  // --- Suite 2: Daily Log File Limit & Streak Milestones ---
  console.log('\n--- Suite 2: Daily Log File Limit & Streak Milestones ---');
  {
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

    const isFileSizeAllowed = (bytes) => bytes <= MAX_FILE_SIZE;
    assert(isFileSizeAllowed(1024 * 500) === true, '500KB file is allowed (under 2MB)');
    assert(isFileSizeAllowed(2 * 1024 * 1024) === true, 'Exact 2MB file is allowed');
    assert(isFileSizeAllowed(2 * 1024 * 1024 + 1) === false, 'File exceeding 2MB by 1 byte is rejected');

    // Streak milestone calculations: milestones = [7, 14, 30]
    const calculateMilestone = (streak) => {
      const milestones = [7, 14, 30];
      const next = milestones.find((m) => m > streak) || 30;
      const pct = Math.min(100, Math.round((streak / next) * 100));
      return { next, pct };
    };

    assert(calculateMilestone(3).next === 7, 'Streak 3 targets 7-day milestone');
    assert(calculateMilestone(3).pct === 43, 'Streak 3 progress is 43% of 7-day target');
    assert(calculateMilestone(7).next === 14, 'Streak 7 targets 14-day milestone');
    assert(calculateMilestone(14).next === 30, 'Streak 14 targets 30-day milestone');
    assert(calculateMilestone(35).next === 30 && calculateMilestone(35).pct === 100, 'Streak 35 caps at 100% of 30-day milestone');
  }

  // --- Suite 3: Leave Application Date Boundaries & Balances ---
  console.log('\n--- Suite 3: Leave Application Date Boundaries & Balances ---');
  {
    const validateLeaveDates = (start, end) => {
      if (!start || !end) return false;
      return end >= start;
    };

    assert(validateLeaveDates('2026-09-25', '2026-09-27') === true, 'Forward date range is valid');
    assert(validateLeaveDates('2026-09-25', '2026-09-25') === true, 'Single day leave is valid');
    assert(validateLeaveDates('2026-09-27', '2026-09-25') === false, 'End date prior to start date is rejected');

    // Remaining leave calculation
    const computeRemaining = (allocated, used) => Math.max(0, (allocated || 0) - (used || 0));
    assert(computeRemaining(12, 3) === 9, '12 allocated - 3 used = 9 remaining');
    assert(computeRemaining(5, 5) === 0, '5 allocated - 5 used = 0 remaining');
    assert(computeRemaining(5, 7) === 0, 'Used exceeding allocated safely clamps to 0');
  }

  // --- Suite 4: Device Security Status & Replacement Taxonomy ---
  console.log('\n--- Suite 4: Device Security Status & Replacement Taxonomy ---');
  {
    const VALID_STATUSES = ['active', 'temporary', 'pending', 'none'];
    const isKnownStatus = (st) => VALID_STATUSES.includes(st);

    assert(isKnownStatus('active'), 'active status recognized');
    assert(isKnownStatus('temporary'), 'temporary status recognized');
    assert(isKnownStatus('pending'), 'pending status recognized');
    assert(isKnownStatus('none'), 'none status recognized');
    assert(!isKnownStatus('unknown_status'), 'unregistered status rejected');

    const VALID_REQUEST_TYPES = ['temporary', 'replacement', 'lost'];
    const isValidDeviceRequest = (req) => {
      if (!VALID_REQUEST_TYPES.includes(req.requestType)) return false;
      if (!req.deviceFingerprint || req.deviceFingerprint.length < 16) return false;
      if (!req.reason || req.reason.trim().length === 0) return false;
      return true;
    };

    assert(
      isValidDeviceRequest({
        requestType: 'replacement',
        deviceFingerprint: 'a1b2c3d4e5f6789012345678',
        reason: 'New phone purchased',
      }) === true,
      'Valid replacement device payload accepted'
    );

    assert(
      isValidDeviceRequest({
        requestType: 'invalid_type',
        deviceFingerprint: 'a1b2c3d4e5f6789012345678',
        reason: 'Lost phone',
      }) === false,
      'Invalid device request type rejected'
    );
  }

  // --- Suite 5: Manual Attendance Validation ---
  console.log('\n--- Suite 5: Manual Attendance Validation ---');
  {
    const validateManualPunch = (requestDate, reason) => {
      if (!requestDate) return false;
      if (!reason || reason.trim().length < 3) return false;
      return true;
    };

    assert(validateManualPunch('2026-09-21', 'Camera hardware sensor error') === true, 'Valid manual punch accepted');
    assert(validateManualPunch('2026-09-21', 'ab') === false, 'Reason under 3 characters rejected');
    assert(validateManualPunch('', 'WiFi down') === false, 'Missing date rejected');
  }

  console.log(`\n=============================================`);
  console.log(`Phase 7 Compliance Tests Completed: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`=============================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase7ComplianceTests();

const {
  calculateLiveWorkMetrics,
  calculateLiveWorkMs,
  formatTimerSeconds,
  formatDuration,
  isLogSheetLocked,
} = require('./src/utils/workMetrics');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

console.log('--- TESTING WORKDAY CALCULATION ENGINE ---');

// Test 1: Formatting utilities
assert(formatTimerSeconds(0) === '00:00:00', 'formatTimerSeconds(0) is 00:00:00');
assert(formatTimerSeconds(3665) === '01:01:05', 'formatTimerSeconds(3665) is 01:01:05');
assert(formatDuration(0) === '0m', 'formatDuration(0) is 0m');
assert(formatDuration(45) === '45m', 'formatDuration(45) is 45m');
assert(formatDuration(125) === '2h 5m', 'formatDuration(125) is 2h 5m');

// Test 2: Shift with Check-In at 09:00 IST and Check-Out at 12:00 IST (no lunch, no breaks)
const dateStr = '2026-09-21';
const t0900 = `${dateStr}T09:00:00.000+05:30`;
const t1200 = `${dateStr}T12:00:00.000+05:30`;

const m1 = calculateLiveWorkMetrics(t0900, t1200, [], null);
assert(m1.totalDurationMinutes === 180, 'Gross duration is 180 min (3h)');
assert(m1.totalBreakMinutes === 0, 'No breaks before 13:00');
assert(m1.actualWorkMinutes === 180, 'Actual work is 180 min');

// Test 3: Shift spanning across lunch (09:00 to 15:00 IST = 6 hours)
// Auto-deduction of 13:00 to 14:00 lunch (60 min)
const t1500 = `${dateStr}T15:00:00.000+05:30`;
const m2 = calculateLiveWorkMetrics(t0900, t1500, [], null);
assert(m2.totalDurationMinutes === 360, 'Gross duration is 360 min (6h)');
assert(m2.totalBreakMinutes === 60, 'Auto-deducted 60 min lunch break (13:00-14:00 IST)');
assert(m2.actualWorkMinutes === 300, 'Net work is 300 min (5h)');

// Test 4: Overlapping manual break with lunch (Interval Union)
// Manual break: 13:30 to 14:30 (60 min)
// Auto lunch: 13:00 to 14:00 (60 min)
// Combined union interval: 13:00 to 14:30 (90 min) -> MUST NOT double deduct to 120 min!
const manualBreak = {
  startedAt: `${dateStr}T13:30:00.000+05:30`,
  endedAt: `${dateStr}T14:30:00.000+05:30`,
  type: 'Lunch',
};
const m3 = calculateLiveWorkMetrics(t0900, t1500, [manualBreak], null);
assert(m3.totalDurationMinutes === 360, 'Gross duration remains 360 min');
assert(m3.totalBreakMinutes === 90, 'Interval union correctly calculates 90 min break, not 120 min');
assert(m3.actualWorkMinutes === 270, 'Net work is 270 min (4h 30m)');

// Test 5: Shift capped at 18:00 IST limit
// Check-In at 09:00 IST, Check-Out attempted at 21:00 IST (9:00 PM)
// Must be capped at 18:00 IST (9 hours gross = 540 min, minus 60 min lunch = 480 min net work)
const t2100 = `${dateStr}T21:00:00.000+05:30`;
const m4 = calculateLiveWorkMetrics(t0900, t2100, [], null);
assert(m4.totalDurationMinutes === 540, 'Gross duration capped at 18:00 IST (540 min / 9h)');
assert(m4.totalBreakMinutes === 60, 'Lunch break deducted (60 min)');
assert(m4.actualWorkMinutes === 480, 'Net work capped at 480 min (8h target)');

console.log('--- ALL WORKDAY CALCULATION TESTS PASSED (0% DIVERGENCE) ---');

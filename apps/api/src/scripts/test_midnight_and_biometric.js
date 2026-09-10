const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const {
  getBusinessDateString,
  getBusinessEndOfDay,
  finalizeAttendanceCheckout,
} = require('../utils/dateUtils');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const User = require('../models/User');
const Team = require('../models/Team');
const { runMidnightAutoCheckout } = require('../jobs/allJobs');
const webauthnService = require('../services/webauthn.service');

async function runTests() {
  console.log('=== TEST SUITE: Midnight Automation & Biometric WebAuthn ===\n');

  // Test 1: Date & Timezone Tests
  console.log('--- Test 1: Asia/Kolkata Business Date & Timezone Calculations ---');
  const sampleUtcMidnight = new Date('2026-09-09T18:30:00.000Z'); // Exactly 00:00:00 IST on Sept 10
  const istDate = getBusinessDateString(sampleUtcMidnight, 'Asia/Kolkata');
  if (istDate !== '2026-09-10') throw new Error(`Expected 2026-09-10 in IST, got ${istDate}`);
  console.log(`✅ IST date at 18:30 UTC: ${istDate}`);

  const endOfDay = getBusinessEndOfDay('2026-09-09');
  const endOfDayIso = endOfDay.toISOString();
  if (endOfDayIso !== '2026-09-09T18:29:59.000Z') {
    throw new Error(`Expected 2026-09-09T18:29:59.000Z, got ${endOfDayIso}`);
  }
  console.log(`✅ Business end of day (23:59:59 IST): ${endOfDayIso}`);

  // Connect to DB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('\n--- Connected to MongoDB ---');

  // Find or create test team & users
  let testTeam = await Team.findOne({ name: 'Test Tech Team' });
  if (!testTeam) {
    testTeam = await Team.create({ name: 'Test Tech Team', description: 'Technical' });
  }

  const testUserA = await User.findOneAndUpdate(
    { email: 'test_completed_emp@spheronix.internal' },
    {
      $set: {
        name: 'Test Completed Employee',
        role: 'employee',
        teamId: testTeam._id,
        passwordHash: 'dummyhash',
        tokenVersion: 1,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  const testUserB = await User.findOneAndUpdate(
    { email: 'test_abandoned_emp@spheronix.internal' },
    {
      $set: {
        name: 'Test Abandoned Employee',
        role: 'employee',
        teamId: testTeam._id,
        passwordHash: 'dummyhash',
        tokenVersion: 5,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  const testWorkDate = '2026-09-08'; // In the past relative to simulated midnight run

  // Clean previous test records
  await Attendance.deleteMany({ userId: { $in: [testUserA._id, testUserB._id] } });
  await DailyLog.deleteMany({ userId: { $in: [testUserA._id, testUserB._id] } });

  // Setup Employee A (Normal complete shift)
  const checkInA = new Date(`${testWorkDate}T09:00:00.000+05:30`);
  const checkOutA = new Date(`${testWorkDate}T18:00:00.000+05:30`);
  const attA = await Attendance.create({
    userId: testUserA._id,
    date: testWorkDate,
    checkInTime: checkInA,
    checkOutTime: checkOutA,
    status: 'present',
    dailyLogSubmitted: true,
    autoCheckedOut: false,
    actualWorkMinutes: 540,
    totalDurationMinutes: 540,
  });

  const logA = await DailyLog.create({
    userId: testUserA._id,
    teamId: testTeam._id,
    logDate: testWorkDate,
    hoursSpent: 8.5,
    taskTitle: 'Implemented Feature X',
    projectName: 'Spheronix Core',
    status: 'submitted',
  });

  // Setup Employee B (Abandoned shift: checked in, forgot checkout, no daily log)
  const checkInB = new Date(`${testWorkDate}T10:00:00.000+05:30`);
  const attB = await Attendance.create({
    userId: testUserB._id,
    date: testWorkDate,
    checkInTime: checkInB,
    checkOutTime: null,
    status: 'incomplete',
    dailyLogSubmitted: false,
    autoCheckedOut: false,
  });

  console.log('\n--- Running Midnight Auto-Checkout Simulation ---');
  // Simulate running at midnight on 2026-09-09 (closing 2026-09-08)
  const simulatedMidnightRunTime = new Date('2026-09-09T00:00:00.000+05:30');
  const result = await runMidnightAutoCheckout(simulatedMidnightRunTime);
  console.log('Midnight Auto-Checkout Result:', result);

  // Assertions for Employee A (Completed)
  console.log('\n--- Asserting Employee A (Completed Employee: Must be Untouched) ---');
  const postAttA = await Attendance.findById(attA._id);
  const postLogA = await DailyLog.findById(logA._id);
  const postUserA = await User.findById(testUserA._id);

  if (postAttA.checkOutTime.getTime() !== checkOutA.getTime()) {
    throw new Error('Employee A checkOutTime was modified!');
  }
  if (postAttA.autoCheckedOut === true) {
    throw new Error('Employee A was marked as autoCheckedOut!');
  }
  if (postLogA.taskTitle !== 'Implemented Feature X') {
    throw new Error('Employee A DailyLog was overwritten!');
  }
  if (postUserA.tokenVersion !== 1) {
    throw new Error('Employee A tokenVersion was incremented!');
  }
  console.log('✅ Employee A completely untouched: checkOutTime, DailyLog, and session preserved.');

  // Assertions for Employee B (Abandoned Shift)
  console.log('\n--- Asserting Employee B (Abandoned Shift: Auto-Closed) ---');
  const postAttB = await Attendance.findById(attB._id);
  const postLogB = await DailyLog.findOne({ userId: testUserB._id, logDate: testWorkDate });
  const postUserB = await User.findById(testUserB._id);

  if (!postAttB.checkOutTime) {
    throw new Error('Employee B checkOutTime was NOT set!');
  }
  const expectedCheckOutMs = getBusinessEndOfDay(testWorkDate).getTime();
  if (postAttB.checkOutTime.getTime() !== expectedCheckOutMs) {
    throw new Error(`Expected checkOutTime ${expectedCheckOutMs}, got ${postAttB.checkOutTime.getTime()}`);
  }
  if (postAttB.autoCheckedOut !== true) {
    throw new Error('Employee B autoCheckedOut is not true!');
  }
  if (postAttB.dailyLogSubmitted !== true) {
    throw new Error('Employee B dailyLogSubmitted is not true!');
  }
  if (postAttB.status !== 'incomplete') {
    throw new Error(`Expected status incomplete, got ${postAttB.status}`);
  }
  if (postAttB.actualWorkMinutes <= 0) {
    throw new Error('Employee B actualWorkMinutes was not computed!');
  }
  console.log(`✅ Employee B checkOutTime set to 23:59:59 IST (${postAttB.checkOutTime.toISOString()})`);
  console.log(`✅ Employee B actualWorkMinutes computed: ${postAttB.actualWorkMinutes} mins`);
  console.log(`✅ Employee B autoCheckedOut = true, status = 'incomplete'`);

  if (!postLogB) {
    throw new Error('Employee B DailyLog was not created!');
  }
  if (!postLogB.taskTitle.includes('N/A')) {
    throw new Error(`Expected DailyLog taskTitle to contain N/A, got ${postLogB.taskTitle}`);
  }
  if (postLogB.projectName !== 'N/A' || postLogB.blockers !== 'N/A') {
    throw new Error('Missing fields were not populated with N/A!');
  }
  console.log(`✅ Employee B DailyLog created with "N/A" fields:`, {
    hoursSpent: postLogB.hoursSpent,
    taskTitle: postLogB.taskTitle,
    projectName: postLogB.projectName,
    blockers: postLogB.blockers,
    status: postLogB.status,
  });

  if (postUserB.tokenVersion !== 6) {
    throw new Error(`Expected tokenVersion 6, got ${postUserB.tokenVersion}`);
  }
  console.log(`✅ Employee B tokenVersion incremented from 5 to 6 (session invalidated).`);

  // Test 3: WebAuthn Hints
  console.log('\n--- Test 3: WebAuthn hints: ["client-device"] ---');
  // Clean challenge store and test generation
  const mockReq = { headers: { origin: 'https://test.spheronix.internal' } };
  const regOpts = await webauthnService.generateEnrollmentOptionsForUser(
    testUserB,
    { _id: new mongoose.Types.ObjectId() },
    mockReq
  );
  if (!regOpts.hints || !regOpts.hints.includes('client-device')) {
    throw new Error('hints: ["client-device"] not found in registration options!');
  }
  console.log('✅ Registration options hints:', regOpts.hints);
  console.log('✅ authenticatorAttachment:', regOpts.authenticatorSelection?.authenticatorAttachment);
  console.log('✅ userVerification:', regOpts.authenticatorSelection?.userVerification);

  // Clean up test records
  await Attendance.deleteMany({ userId: { $in: [testUserA._id, testUserB._id] } });
  await DailyLog.deleteMany({ userId: { $in: [testUserA._id, testUserB._id] } });
  await User.deleteMany({ _id: { $in: [testUserA._id, testUserB._id] } });
  console.log('🧹 Cleaned up test records.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

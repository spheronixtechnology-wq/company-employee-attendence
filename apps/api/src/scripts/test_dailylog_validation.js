const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const { submitDailyLog, autoSubmitMissingDailyLog } = require('../services/dailyLog.service');
const DailyLog = require('../models/DailyLog');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Team = require('../models/Team');

async function runTests() {
  console.log('=== TEST SUITE: Daily Log Form Overhaul & Validation ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- Connected to MongoDB ---');

  let testTeam = await Team.findOne({ name: 'Validation Test Team' });
  if (!testTeam) {
    testTeam = await Team.create({ name: 'Validation Test Team', description: 'Test Team' });
  }

  const testUser = await User.findOneAndUpdate(
    { email: 'dailylog_test_user@spheronix.internal' },
    {
      $set: {
        name: 'DailyLog Test User',
        role: 'employee',
        teamId: testTeam._id,
        passwordHash: 'dummyhash',
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  // Clean previous test records
  await DailyLog.deleteMany({ userId: testUser._id });

  // ── Test 1: Required Field Validations ──
  console.log('\n--- Test 1: Required Field Validations ---');

  // Missing Task Title
  try {
    await submitDailyLog({
      user: testUser,
      logData: { projectName: 'Project A', description: 'Some work' },
    });
    throw new Error('Should have failed due to missing Task Title');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Task Title')) {
      throw err;
    }
    console.log('✅ Missing Task Title rejected:', err.message);
  }

  // Missing Project Name
  try {
    await submitDailyLog({
      user: testUser,
      logData: { taskTitle: 'Feature X', description: 'Some work' },
    });
    throw new Error('Should have failed due to missing Project Name');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Project Name')) {
      throw err;
    }
    console.log('✅ Missing Project Name rejected:', err.message);
  }

  // Missing Description
  try {
    await submitDailyLog({
      user: testUser,
      logData: { taskTitle: 'Feature X', projectName: 'Project A', description: '   ' },
    });
    throw new Error('Should have failed due to missing Description');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Description')) {
      throw err;
    }
    console.log('✅ Missing Description rejected:', err.message);
  }

  // ── Test 2: GitHub URL Validation ──
  console.log('\n--- Test 2: GitHub URL Validation ---');

  // Invalid: Non-GitHub domain
  try {
    await submitDailyLog({
      user: testUser,
      logData: {
        taskTitle: 'Feature X',
        projectName: 'Project A',
        description: 'Completed tasks',
        githubLink: 'https://gitlab.com/user/project',
      },
    });
    throw new Error('Should have failed for non-GitHub domain');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Invalid GitHub URL')) {
      throw err;
    }
    console.log('✅ Non-GitHub domain rejected:', err.message);
  }

  // Invalid: Just github.com without repo
  try {
    await submitDailyLog({
      user: testUser,
      logData: {
        taskTitle: 'Feature X',
        projectName: 'Project A',
        description: 'Completed tasks',
        githubLink: 'https://github.com',
      },
    });
    throw new Error('Should have failed for root github.com URL');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Invalid GitHub URL')) {
      throw err;
    }
    console.log('✅ Root github.com URL rejected:', err.message);
  }

  // Invalid: random text
  try {
    await submitDailyLog({
      user: testUser,
      logData: {
        taskTitle: 'Feature X',
        projectName: 'Project A',
        description: 'Completed tasks',
        githubLink: 'random-link-string',
      },
    });
    throw new Error('Should have failed for random string');
  } catch (err) {
    if (err.statusCode !== 400 || !err.message.includes('Invalid GitHub URL')) {
      throw err;
    }
    console.log('✅ Random string rejected:', err.message);
  }

  // ── Test 3: Successful Submission with Valid GitHub & Multiple Research Links ──
  console.log('\n--- Test 3: Valid GitHub & Multiple Research Links ---');

  const validLog = await submitDailyLog({
    user: testUser,
    logData: {
      taskTitle: 'Implemented OAuth2 and PR verification',
      projectName: 'Spheronix Core',
      description: 'Refactored authentication middleware, handled refresh token rotation, and added tests.',
      githubLink: 'github.com/spheronix/attendance-system/pull/42', // Should auto-prepend https://
      researchLinks: [
        'https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API',
        'https://stackoverflow.com/questions/12345/oauth2',
        '   ', // Should be stripped out
      ],
      hoursSpent: 7.5,
    },
  });

  if (validLog.taskTitle !== 'Implemented OAuth2 and PR verification') {
    throw new Error('taskTitle mismatch');
  }
  if (validLog.description !== 'Refactored authentication middleware, handled refresh token rotation, and added tests.') {
    throw new Error('description mismatch');
  }
  if (validLog.githubLink !== 'https://github.com/spheronix/attendance-system/pull/42') {
    throw new Error(`Expected normalized https://github.com/..., got ${validLog.githubLink}`);
  }
  if (!Array.isArray(validLog.researchLinks) || validLog.researchLinks.length !== 2) {
    throw new Error(`Expected 2 cleaned research links, got ${validLog.researchLinks?.length}`);
  }
  if (validLog.researchLinks[0] !== 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API') {
    throw new Error('First research link mismatch');
  }
  console.log('✅ Daily log successfully submitted and saved:');
  console.log('   Task Title:', validLog.taskTitle);
  console.log('   Project:', validLog.projectName);
  console.log('   Description:', validLog.description);
  console.log('   GitHub Link (normalized):', validLog.githubLink);
  console.log('   Research Links count:', validLog.researchLinks.length, validLog.researchLinks);

  // ── Test 4: Midnight Auto-Submit Defaults ──
  console.log('\n--- Test 4: Midnight Auto-Submit Defaults ---');
  const dummyAtt = { actualWorkMinutes: 480 };
  const autoLog = await autoSubmitMissingDailyLog({
    user: testUser,
    attendance: dummyAtt,
    logDate: '2026-09-01',
  });

  if (!autoLog.description.includes('N/A')) {
    throw new Error(`Expected description to include N/A, got ${autoLog.description}`);
  }
  if (autoLog.githubLink !== null) {
    throw new Error(`Expected null githubLink, got ${autoLog.githubLink}`);
  }
  if (!Array.isArray(autoLog.researchLinks) || autoLog.researchLinks.length !== 0) {
    throw new Error(`Expected empty researchLinks, got ${autoLog.researchLinks}`);
  }
  console.log('✅ Midnight auto-submit populated defaults properly:');
  console.log('   Description:', autoLog.description);
  console.log('   GitHub Link:', autoLog.githubLink);
  console.log('   Research Links:', autoLog.researchLinks);

  // Clean up test records
  await DailyLog.deleteMany({ userId: testUser._id });
  await User.deleteOne({ _id: testUser._id });
  console.log('\n🧹 Test records cleaned up.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

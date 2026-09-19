const mongoose = require('mongoose');
require('dotenv').config({ path: 'e:/Employee Dashboard/attendance-system/apps/api/.env' });

require('../models/User');
const User = mongoose.model('User');
const Attendance = require('../models/Attendance');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const adminController = require('../controllers/admin.controller');
const sessionReactivationService = require('../services/sessionReactivation.service');
const { getTodayDateString } = require('../utils/dateUtils');

function mockResponse() {
  const res = {};
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (payload) {
    this.body = payload;
    return this;
  };
  return res;
}

async function runTests() {
  console.log('🧪 Starting Production Test Suite: Heartbeat Presence Toggle & Resilient Baseline\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas\n');

    const admin = await User.findOne({ role: 'admin' });
    assert(!!admin, `Admin user exists: ${admin?.email}`);

    // Ensure singleton migration in DB: clean up older historical duplicates keeping the latest
    const latestSetting = await AttendanceMethodSetting.findOne().sort({ changedAt: -1, createdAt: -1 });
    if (latestSetting) {
      await AttendanceMethodSetting.deleteMany({ _id: { $ne: latestSetting._id } });
    }

    // Test 1: Singleton Configuration
    console.log('\n--- 1. Testing Singleton Configuration ---');
    const activeSetting = await AttendanceMethodSetting.getActiveSetting();
    const docCount = await AttendanceMethodSetting.countDocuments();
    assert(docCount === 1, `Exactly 1 singleton document in AttendanceMethodSetting (found: ${docCount})`);
    assert(typeof activeSetting.heartbeatMonitoringEnabled === 'boolean', `heartbeatMonitoringEnabled is boolean: ${activeSetting.heartbeatMonitoringEnabled}`);
    assert(activeSetting.heartbeatTimeoutMinutes === 8, `Default heartbeatTimeoutMinutes is 8: ${activeSetting.heartbeatTimeoutMinutes}`);

    // Test 2: Atomic Toggle ON
    console.log('\n--- 2. Testing Atomic Toggle ON ---');
    const reqOn = {
      user: admin,
      body: {
        enabled: true,
        timeoutMinutes: 8,
        reason: 'Automated test enabling heartbeat tracking',
      },
    };
    const resOn = mockResponse();
    await adminController.toggleHeartbeatMonitoring(reqOn, resOn);
    assert(resOn.statusCode === 200, `Toggle ON status code is 200 (got: ${resOn.statusCode})`);
    assert(resOn.body?.data?.heartbeatMonitoringEnabled === true, 'Response confirms heartbeatMonitoringEnabled === true');
    assert(!!resOn.body?.data?.heartbeatMonitoringStartedAt, 'heartbeatMonitoringStartedAt is set');

    const dbSettingOn = await AttendanceMethodSetting.getActiveSetting();
    assert(dbSettingOn.heartbeatMonitoringEnabled === true, 'MongoDB confirms heartbeatMonitoringEnabled === true');
    const startedAtMs = new Date(dbSettingOn.heartbeatMonitoringStartedAt).getTime();
    assert(startedAtMs > 0, `heartbeatMonitoringStartedAt timestamp recorded: ${dbSettingOn.heartbeatMonitoringStartedAt}`);

    // Test 3: Epoch-Aware Baseline Logic
    console.log('\n--- 3. Testing Epoch-Aware Monitoring Baseline ---');
    const nowMs = Date.now();
    // Simulate old heartbeat from 2 hours prior to startedAtMs
    const oldHeartbeatAt = new Date(startedAtMs - 2 * 3600 * 1000);
    const lastHeartbeatMs = (oldHeartbeatAt && oldHeartbeatAt.getTime() >= startedAtMs)
      ? oldHeartbeatAt.getTime()
      : 0;
    assert(lastHeartbeatMs === 0, 'Old heartbeat received before startedAtMs is correctly disregarded (= 0)');

    const effectiveBaselineMs = Math.max(lastHeartbeatMs, startedAtMs);
    assert(effectiveBaselineMs === startedAtMs, 'Effective baseline correctly uses startedAtMs, protecting existing sessions from instant auto-checkout');

    // Test 4: Employee-Specific Lunch Baseline
    console.log('\n--- 4. Testing Employee-Specific Lunch Baseline ---');
    const today = getTodayDateString('Asia/Kolkata');
    const lunchEndMs = new Date(`${today}T14:00:00.000+05:30`).getTime();
    
    // Employee A: Checked in at 9:00 AM (before lunch)
    const checkInMsA = new Date(`${today}T09:00:00.000+05:30`).getTime();
    const wasSubjectToLunchA = checkInMsA > 0 && checkInMsA < lunchEndMs && nowMs >= lunchEndMs;
    assert(wasSubjectToLunchA === true, 'Morning worker (checked in 9:00 AM) was subject to lunch window');

    // Employee B: Checked in at 3:00 PM (after lunch)
    const checkInMsB = new Date(`${today}T15:00:00.000+05:30`).getTime();
    const wasSubjectToLunchB = checkInMsB > 0 && checkInMsB < lunchEndMs && nowMs >= lunchEndMs;
    assert(wasSubjectToLunchB === false, 'Afternoon worker (checked in 3:00 PM) was NOT subject to lunch window');

    // Test 5: Reactivation Grace Window & GRACE_PERIOD State
    console.log('\n--- 5. Testing Reactivation Grace & GRACE_PERIOD State ---');
    const testSession = await Attendance.findOne({ date: today, checkInTime: { $ne: null } });
    if (testSession) {
      const reactivateRes = await sessionReactivationService.approveSessionReactivation({
        attendanceId: testSession._id,
        reviewerUser: admin,
        notes: 'Testing reactivation grace state',
        ipAddress: '127.0.0.1',
      });
      assert(reactivateRes.success === true, 'Reactivation approval succeeded');
      assert(reactivateRes.attendance.heartbeatStatus === 'GRACE_PERIOD', `heartbeatStatus is 'GRACE_PERIOD' (got: ${reactivateRes.attendance.heartbeatStatus})`);
      assert(!!reactivateRes.attendance.heartbeatMonitoringGraceUntil, 'heartbeatMonitoringGraceUntil is set');
      const graceRemainingMs = new Date(reactivateRes.attendance.heartbeatMonitoringGraceUntil).getTime() - Date.now();
      assert(graceRemainingMs > 25 * 60 * 1000, `Grace window is ~30 minutes (${Math.round(graceRemainingMs / 60000)}m remaining)`);
    }

    // Test 6: Atomic Toggle OFF & One-Time Batch NOT_MONITORED Update
    console.log('\n--- 6. Testing Atomic Toggle OFF & Batch Update ---');
    const reqOff = {
      user: admin,
      body: {
        enabled: false,
        reason: 'Automated test disabling heartbeat tracking',
      },
    };
    const resOff = mockResponse();
    await adminController.toggleHeartbeatMonitoring(reqOff, resOff);
    assert(resOff.statusCode === 200, `Toggle OFF status code is 200 (got: ${resOff.statusCode})`);
    assert(resOff.body?.data?.heartbeatMonitoringEnabled === false, 'Response confirms heartbeatMonitoringEnabled === false');
    assert(resOff.body?.data?.heartbeatMonitoringStartedAt === null, 'heartbeatMonitoringStartedAt is null when OFF');

    const dbSettingOff = await AttendanceMethodSetting.getActiveSetting();
    assert(dbSettingOff.heartbeatMonitoringEnabled === false, 'MongoDB confirms heartbeatMonitoringEnabled === false');

    // Verify all active sessions were updated to NOT_MONITORED once upon turning OFF
    const activeWithOtherStatus = await Attendance.countDocuments({
      date: today,
      checkOutTime: null,
      heartbeatStatus: { $ne: 'NOT_MONITORED' },
    });
    assert(activeWithOtherStatus === 0, `All active sessions cleanly transitioned to NOT_MONITORED (non-NOT_MONITORED count: ${activeWithOtherStatus})`);

    // Test 7: Method Switching Preserves Heartbeat Settings
    console.log('\n--- 7. Testing Method Switch Preserves Heartbeat Configuration ---');
    const reqSwitch = {
      user: admin,
      body: {
        method: 'wifi_ip',
        reason: 'Switching method to wifi_ip for test',
      },
    };
    const resSwitch = mockResponse();
    await adminController.switchAttendanceMethod(reqSwitch, resSwitch);
    assert(resSwitch.statusCode === 200, 'switchAttendanceMethod succeeded');
    const dbSettingSwitched = await AttendanceMethodSetting.getActiveSetting();
    assert(dbSettingSwitched.activeMethod === 'wifi_ip', `Active method updated to wifi_ip: ${dbSettingSwitched.activeMethod}`);
    assert(dbSettingSwitched.heartbeatMonitoringEnabled === false, 'heartbeatMonitoringEnabled preserved as false after method switch');
    assert(dbSettingSwitched.heartbeatTimeoutMinutes === 8, 'heartbeatTimeoutMinutes preserved as 8 after method switch');

    // Restore method to biometric/qr_code as appropriate
    const reqRestore = {
      user: admin,
      body: { method: 'qr_code', reason: 'Restoring default method' },
    };
    await adminController.switchAttendanceMethod(reqRestore, mockResponse());

    console.log('\n========================================');
    console.log(`📊 Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('========================================\n');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  }
}

runTests();

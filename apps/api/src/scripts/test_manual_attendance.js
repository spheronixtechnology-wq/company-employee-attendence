const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const ManualAttendanceRequest = require('../models/ManualAttendanceRequest');
const employeeController = require('../controllers/employee.controller');

// Mock Express req/res
const mockReqRes = (user, body = {}, params = {}, query = {}) => {
  const req = { user, body, params, query };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
};

async function runTests() {
  console.log('=== TEST SUITE: Manual Attendance Request Flow ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- Connected to MongoDB ---');

  const testUser = await User.findOneAndUpdate(
    { email: 'garudatretha@gmail.com' },
    { $set: { name: 'Garuda', role: 'employee', isActive: true } },
    { new: true }
  );

  if (!testUser) {
    throw new Error('Test employee user not found');
  }

  const testDate = '2026-09-10';

  // Clean prior test records
  await ManualAttendanceRequest.deleteMany({ userId: testUser._id, requestDate: testDate });
  await Attendance.deleteMany({ userId: testUser._id, date: testDate });

  // ── Test 1: Validation Failures ──
  console.log('\n--- Test 1: Validation Failures ---');

  // Missing date
  {
    const { req, res, getStatus, getData } = mockReqRes(testUser, { reason: 'Test reason' });
    await employeeController.requestManualAttendance(req, res);
    if (getStatus() !== 400) throw new Error('Expected 400 for missing date');
    console.log('✅ Missing date rejected:', getData().message);
  }

  // Short reason (< 3 chars)
  {
    const { req, res, getStatus, getData } = mockReqRes(testUser, { requestDate: testDate, reason: 'a' });
    await employeeController.requestManualAttendance(req, res);
    if (getStatus() !== 400) throw new Error('Expected 400 for short reason');
    console.log('✅ Short reason rejected:', getData().message);
  }

  // ── Test 2: Successful Request Submission ──
  console.log('\n--- Test 2: Successful Request Submission ---');
  {
    const { req, res, getStatus, getData } = mockReqRes(testUser, {
      requestDate: testDate,
      reason: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    await employeeController.requestManualAttendance(req, res);
    if (getStatus() !== 200 || !getData().success) {
      throw new Error(`Submission failed: ${JSON.stringify(getData())}`);
    }
    console.log('✅ Manual attendance request created successfully:', getData().data.request._id);
  }

  // Verify DB state
  const savedReq = await ManualAttendanceRequest.findOne({ userId: testUser._id, requestDate: testDate });
  if (!savedReq || savedReq.status !== 'pending') {
    throw new Error('ManualAttendanceRequest was not saved as pending in DB');
  }
  console.log('✅ DB verification: ManualAttendanceRequest status is', savedReq.status);

  const attRecord = await Attendance.findOne({ userId: testUser._id, date: testDate });
  if (!attRecord || attRecord.status !== 'manual_pending' || attRecord.checkInMethod !== 'manual') {
    throw new Error(`Attendance status expected manual_pending/manual, got ${attRecord?.status}/${attRecord?.checkInMethod}`);
  }
  console.log('✅ DB verification: Attendance status set to', attRecord.status, 'with method', attRecord.checkInMethod);

  // ── Test 3: Duplicate Request Prevention ──
  console.log('\n--- Test 3: Duplicate Request Prevention ---');
  {
    const { req, res, getStatus, getData } = mockReqRes(testUser, {
      requestDate: testDate,
      reason: 'another reason',
    });
    await employeeController.requestManualAttendance(req, res);
    if (getStatus() !== 400) throw new Error('Expected 400 for duplicate pending request');
    console.log('✅ Duplicate pending request blocked:', getData().message);
  }

  // ── Test 4: Fetch Employee Requests ──
  console.log('\n--- Test 4: Fetch Employee Requests ---');
  {
    const { req, res, getStatus, getData } = mockReqRes(testUser);
    await employeeController.getMyManualAttendanceRequests(req, res);
    if (getStatus() !== 200 || !getData().data.requests) {
      throw new Error('Failed to fetch employee requests');
    }
    const found = getData().data.requests.find((r) => r.requestDate === testDate);
    if (!found) throw new Error('Created request not found in user requests list');
    console.log('✅ Fetched employee requests, found request for date:', found.requestDate, 'Status:', found.status);
  }

  // Clean up test records
  await ManualAttendanceRequest.deleteMany({ userId: testUser._id, requestDate: testDate });
  await Attendance.deleteMany({ userId: testUser._id, date: testDate });
  console.log('\n🧹 Test records cleaned up.');

  console.log('\n🎉 ALL MANUAL ATTENDANCE TESTS PASSED!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

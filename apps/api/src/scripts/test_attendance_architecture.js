require('dotenv').config();
const mongoose = require('mongoose');

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for architecture validation.\n');

  const OfficeLocation = require('../models/OfficeLocation');
  const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
  const Attendance = require('../models/Attendance');
  const User = require('../models/User');
  const employeeController = require('../controllers/employee.controller');

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

  // TEST 1: MongoDB Single Source of Truth - OfficeLocation
  const activeOffice = await OfficeLocation.findOne({ status: 'active' });
  assert(activeOffice !== null, 'Active office location exists in MongoDB');
  assert(activeOffice.latitude === 12.8469869, `Office latitude is 12.8469869 (found: ${activeOffice?.latitude})`);
  assert(activeOffice.longitude === 77.6802187, `Office longitude is 77.6802187 (found: ${activeOffice?.longitude})`);
  assert(activeOffice.radiusMeters === 100, `Office radiusMeters is 100m (found: ${activeOffice?.radiusMeters})`);

  // TEST 2: Dashboard data returns managerDefaultMethod and allowedMethods
  const empUser = await User.findOne({ role: 'employee' });
  assert(empUser !== null, `Found employee user: ${empUser?.name}`);

  let dashboardData = null;
  const mockReqDash = { user: empUser };
  const mockResDash = {
    status: function() { return this; },
    json: function(payload) {
      dashboardData = payload?.data;
      return this;
    }
  };
  await employeeController.getDashboard(mockReqDash, mockResDash);
  assert(dashboardData !== null, 'Dashboard data returned successfully');
  assert(typeof dashboardData?.managerDefaultMethod === 'string', `managerDefaultMethod returned: ${dashboardData?.managerDefaultMethod}`);
  assert(Array.isArray(dashboardData?.allowedMethods), `allowedMethods returned array: ${JSON.stringify(dashboardData?.allowedMethods)}`);
  assert(dashboardData.allowedMethods.includes('qr_code') && dashboardData.allowedMethods.includes('wifi_ip'), 'allowedMethods contains enabled methods');

  // TEST 3: Backend Security Gate - Reject disabled or invalid method with 403
  let rejectCode = null;
  let rejectMessage = null;
  const testUserId = new mongoose.Types.ObjectId();
  const mockReqReject = {
    user: { _id: testUserId, role: 'employee', name: 'Test Employee' },
    body: { checkInMethod: 'malicious_override_method', lat: 12.8469869, lng: 77.6802187, accuracy: 10 },
    ip: '127.0.0.1',
    headers: {}
  };
  const mockResReject = {
    status: function(code) {
      rejectCode = code;
      return this;
    },
    json: function(payload) {
      rejectMessage = payload?.message;
      return this;
    }
  };
  await employeeController.checkIn(mockReqReject, mockResReject);
  assert(rejectCode === 403, `Unauthorized checkInMethod rejected with 403 (received: ${rejectCode})`);
  assert(rejectMessage && rejectMessage.includes('METHOD_NOT_ENABLED'), `Rejection message identifies METHOD_NOT_ENABLED: "${rejectMessage}"`);

  console.log(`\n================================`);
  console.log(`Total tests passed: ${passed} / ${passed + failed}`);
  console.log(`================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});

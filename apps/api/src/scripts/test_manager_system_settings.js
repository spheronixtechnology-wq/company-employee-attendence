const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const OfficeLocation = require('../models/OfficeLocation');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const AuditLog = require('../models/AuditLog');
const adminController = require('../controllers/admin.controller');

const mockReqRes = (user, body = {}, params = {}, query = {}) => {
  const req = {
    user,
    body,
    params,
    query,
    headers: { 'x-device-fingerprint': 'test_manager_device' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
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
  console.log('=== TEST SUITE: Manager System Settings & Controls ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- Connected to MongoDB ---');

  const managerUser = await User.findOne({ role: 'manager' });
  if (!managerUser) {
    throw new Error('Manager user not found in DB');
  }
  console.log(`Found Manager: ${managerUser.name} (${managerUser.email})`);

  // 1. Test GET /manager/attendance-method/active
  console.log('\n--- Test 1: GET Active Attendance Method ---');
  const getMethodCtx = mockReqRes(managerUser);
  await adminController.getActiveAttendanceMethod(getMethodCtx.req, getMethodCtx.res);
  console.log('Status:', getMethodCtx.getStatus());
  const activeMethod = getMethodCtx.getData()?.data?.activeMethod;
  console.log('Active Method:', activeMethod);
  if (!activeMethod) throw new Error('Active attendance method returned null');

  // 2. Test PATCH /manager/attendance-method/switch
  console.log('\n--- Test 2: PATCH Switch Attendance Method ---');
  const targetMethod = activeMethod === 'qr_code' ? 'wifi_ip' : 'qr_code';
  const switchCtx = mockReqRes(managerUser, {
    method: targetMethod,
    reason: 'Manager routine verification test',
  });
  await adminController.switchAttendanceMethod(switchCtx.req, switchCtx.res);
  console.log('Status:', switchCtx.getStatus());
  console.log('New Active Method:', switchCtx.getData()?.data?.activeMethod);
  if (switchCtx.getData()?.data?.activeMethod !== targetMethod) {
    throw new Error('Attendance method was not updated');
  }

  // Switch back to original method
  const revertCtx = mockReqRes(managerUser, {
    method: activeMethod,
    reason: 'Reverting test back to initial method',
  });
  await adminController.switchAttendanceMethod(revertCtx.req, revertCtx.res);

  // 3. Test GET /manager/office-locations
  console.log('\n--- Test 3: GET Office Locations ---');
  const getLocCtx = mockReqRes(managerUser);
  await adminController.getOfficeLocations(getLocCtx.req, getLocCtx.res);
  console.log('Status:', getLocCtx.getStatus());
  const locations = getLocCtx.getData()?.data?.locations;
  console.log('Locations Count:', locations?.length);

  // 4. Test POST /manager/office-locations
  console.log('\n--- Test 4: POST Create Office Location as Manager ---');
  const testOfficeName = `Test Branch Office - ${Date.now()}`;
  const createLocCtx = mockReqRes(managerUser, {
    officeName: testOfficeName,
    latitude: 12.9716,
    longitude: 77.5946,
    radiusMeters: 250,
    wifiSsid: 'Spheronix-Manager-5G',
    allowedIps: ['192.168.1.1', '103.5.135.80/28'],
  });
  await adminController.createOfficeLocation(createLocCtx.req, createLocCtx.res);
  console.log('Status:', createLocCtx.getStatus());
  const createdLoc = createLocCtx.getData()?.data?.location;
  console.log('Created Location ID:', createdLoc?._id);
  if (!createdLoc || createdLoc.officeName !== testOfficeName) {
    throw new Error('Failed to create office location');
  }

  // 5. Test PATCH /manager/office-locations/:id
  console.log('\n--- Test 5: PATCH Update Office Location as Manager ---');
  const updateLocCtx = mockReqRes(
    managerUser,
    { radiusMeters: 300 },
    { id: createdLoc._id.toString() }
  );
  await adminController.updateOfficeLocation(updateLocCtx.req, updateLocCtx.res);
  console.log('Status:', updateLocCtx.getStatus());
  console.log('Updated radius:', updateLocCtx.getData()?.data?.location?.radiusMeters);
  if (updateLocCtx.getData()?.data?.location?.radiusMeters !== 300) {
    throw new Error('Failed to update office location radius');
  }

  // 6. Test GET /manager/current-ip
  console.log('\n--- Test 6: GET Current IP as Manager ---');
  const getIpCtx = mockReqRes(managerUser);
  await adminController.getCurrentIp(getIpCtx.req, getIpCtx.res);
  console.log('Status:', getIpCtx.getStatus());
  console.log('Current IP response:', getIpCtx.getData()?.data?.ip);

  // Clean up created test location
  await OfficeLocation.findByIdAndDelete(createdLoc._id);
  console.log('Cleaned up test office location');

  console.log('\n✅ ALL MANAGER SYSTEM SETTINGS TESTS PASSED SUCCESSFULLY!\n');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

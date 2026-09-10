const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const ManagerPermission = require('../models/ManagerPermission');
const adminController = require('../controllers/admin.controller');

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
  console.log('=== TEST SUITE: Manager Permissions API ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- Connected to MongoDB ---');

  const adminUser = await User.findOne({ role: 'admin' });
  const managerUser = await User.findOne({ role: 'manager' });

  if (!adminUser || !managerUser) {
    throw new Error('Admin or Manager user not found in DB');
  }

  console.log(`Found Manager: ${managerUser.name} (${managerUser.email})`);

  // 1. Test getManagerPermissions
  console.log('\n--- Test 1: GET Manager Permissions ---');
  const getCtx = mockReqRes(adminUser);
  await adminController.getManagerPermissions(getCtx.req, getCtx.res);
  const getRes = getCtx.getData();
  console.log('Get response status:', getCtx.getStatus());
  console.log('Managers count:', getRes.data?.managers?.length);
  const targetMgr = getRes.data?.managers?.find(m => m._id.toString() === managerUser._id.toString());
  console.log('Target manager permissions:', targetMgr?.permissions);

  if (!targetMgr || !targetMgr.permissions) {
    throw new Error('Target manager permissions missing from response');
  }

  // 2. Test updateManagerPermission
  console.log('\n--- Test 2: PATCH Manager Permission (Toggle canEditAttendance) ---');
  const currentVal = !!targetMgr.permissions.canEditAttendance;
  const patchCtx = mockReqRes(
    adminUser,
    {
      permissions: {
        ...targetMgr.permissions,
        canEditAttendance: !currentVal,
      },
    },
    { userId: managerUser._id.toString() }
  );

  await adminController.updateManagerPermission(patchCtx.req, patchCtx.res);
  const patchRes = patchCtx.getData();
  console.log('Patch response status:', patchCtx.getStatus());
  console.log('Updated permissions:', patchRes.data?.permissions);

  if (patchRes.data?.permissions?.canEditAttendance !== !currentVal) {
    throw new Error('Permission value was not toggled properly');
  }

  // 3. Verify in DB
  const doc = await ManagerPermission.findOne({ userId: managerUser._id });
  console.log('\n--- Test 3: Verified in MongoDB ---');
  console.log('DB document permissions:', doc.permissions);

  if (doc.permissions.canEditAttendance !== !currentVal) {
    throw new Error('MongoDB document does not match updated state');
  }

  console.log('\n✅ ALL MANAGER PERMISSION TESTS PASSED!\n');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

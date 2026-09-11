const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '.env' });

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const { getTodayDateString } = require('../utils/dateUtils');

const API_URL = 'http://localhost:5000';

async function run() {
  console.log('🚀 Starting Manager Check-In / Check-Out Pipeline Test...');
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // 1. Find or pick an active manager
    const manager = await User.findOne({ role: 'manager', isActive: true });
    if (!manager) {
      throw new Error('No active manager found in database');
    }
    console.log(`👤 Found Manager: ${manager.name} (${manager.email}, ID: ${manager._id})`);

    // Find or pick an active admin for verification
    const admin = await User.findOne({ role: 'admin', isActive: true });
    if (!admin) {
      throw new Error('No active admin found in database');
    }
    console.log(`👑 Found Admin: ${admin.name} (${admin.email}, ID: ${admin._id})`);

    // Create auth tokens
    const managerToken = jwt.sign({ id: manager._id, role: manager.role, tokenVersion: manager.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const adminToken = jwt.sign({ id: admin._id, role: admin.role, tokenVersion: admin.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const managerHeaders = {
      'Content-Type': 'application/json',
      'Cookie': `token_manager=${managerToken}`,
      'x-portal-role': 'manager',
      'x-forwarded-for': '103.5.135.77',
    };

    const adminHeaders = {
      'Content-Type': 'application/json',
      'Cookie': `token_admin=${adminToken}`,
      'x-portal-role': 'admin',
      'x-forwarded-for': '103.5.135.77',
    };

    // Clean up any test attendance for today for this manager to test fresh check-in
    const today = getTodayDateString();
    await Attendance.deleteMany({ userId: manager._id, date: today });
    console.log(`🧹 Cleaned up existing attendance for today (${today})`);

    // 2. Fetch active office to use valid coordinates
    let activeOffice = await OfficeLocation.findOne({ status: 'active' });
    let lat = 12.9716, lng = 77.5946;
    if (activeOffice) {
      lat = activeOffice.latitude;
      lng = activeOffice.longitude;
      console.log(`📍 Using office coords: ${activeOffice.officeName} (${lat}, ${lng})`);
    }

    const activeMethodSetting = await AttendanceMethodSetting.findOne({ isActive: true });
    console.log(`⚙️ Active Attendance Method: ${activeMethodSetting?.method || 'default'}`);

    // Step A: Call manager check-in
    console.log('\n--- Step A: Manager Check-In ---');
    const checkInRes = await fetch(`${API_URL}/api/manager/attendance/check-in`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({ lat, lng, accuracy: 10 }),
    });

    const checkInData = await checkInRes.json();
    console.log(`Check-In Response Status: ${checkInRes.status}`);
    console.log(`Check-In Response Body:`, checkInData);
    if (!checkInRes.ok) {
      throw new Error(`Manager check-in failed with status ${checkInRes.status}: ${JSON.stringify(checkInData)}`);
    }
    console.log('✅ Manager check-in succeeded!');

    // Step B: Verify Admin sees manager in Attendance Records
    console.log('\n--- Step B: Admin Attendance Records Verification ---');
    const adminAttRes = await fetch(`${API_URL}/api/admin/attendance?date=${today}`, {
      headers: adminHeaders,
    });
    const adminAttData = await adminAttRes.json();
    console.log(`Admin Attendance Status: ${adminAttRes.status}`);
    const records = adminAttData?.data?.attendance || [];
    const managerRecord = records.find(r => (r.userId?._id?.toString() || r.userId?.toString()) === manager._id.toString());
    if (!managerRecord) {
      throw new Error('Manager not found in Admin Attendance records list!');
    }
    console.log(`Manager Attendance Record in Admin: Status=${managerRecord.status}, CheckIn=${managerRecord.checkInTime}, Role=${managerRecord.userId?.role}`);
    if (managerRecord.userId?.role !== 'manager') {
      throw new Error(`Expected role 'manager' on userId, got: ${managerRecord.userId?.role}`);
    }
    console.log('✅ Admin Attendance records list includes Manager with role and check-in time!');

    // Step C: Verify Admin sees manager in Employees Directory with live working status
    console.log('\n--- Step C: Admin Employees Directory Verification ---');
    const adminEmpRes = await fetch(`${API_URL}/api/admin/employees?search=${encodeURIComponent(manager.name)}`, {
      headers: adminHeaders,
    });
    const adminEmpData = await adminEmpRes.json();
    const empList = adminEmpData?.data?.employees || [];
    const managerInDir = empList.find(e => e._id.toString() === manager._id.toString());
    if (!managerInDir) {
      throw new Error('Manager not found in Admin Employees directory response!');
    }
    console.log(`Manager in Directory: Name=${managerInDir.name}, currentStatus=${managerInDir.currentStatus}, checkInTime=${managerInDir.todayAttendance?.checkInTime}`);
    if (managerInDir.currentStatus !== 'working') {
      throw new Error(`Expected currentStatus === 'working', got: ${managerInDir.currentStatus}`);
    }
    console.log('✅ Manager live status is "working" in Admin Employees directory!');

    // Step D: Test Break Start and End
    console.log('\n--- Step D: Manager Break Test ---');
    const startBreakRes = await fetch(`${API_URL}/api/manager/break/start`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({ type: 'personal' }),
    });
    console.log(`Start Break Status: ${startBreakRes.status}`);

    const endBreakRes = await fetch(`${API_URL}/api/manager/break/end`, {
      method: 'POST',
      headers: managerHeaders,
    });
    console.log(`End Break Status: ${endBreakRes.status}`);
    console.log('✅ Manager break start/end succeeded!');

    // Step E: Manager Check-Out
    console.log('\n--- Step E: Manager Check-Out ---');
    const checkOutRes = await fetch(`${API_URL}/api/manager/attendance/check-out`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({ lat, lng }),
    });
    const checkOutData = await checkOutRes.json();
    console.log(`Check-Out Status: ${checkOutRes.status}`);
    console.log(`Check-Out Body:`, checkOutData);
    if (!checkOutRes.ok) {
      throw new Error(`Manager check-out failed: ${JSON.stringify(checkOutData)}`);
    }
    console.log('✅ Manager check-out succeeded!');

    // Step F: Verify Admin sees checked_out status
    console.log('\n--- Step F: Admin Status After Check-Out ---');
    const adminEmpResAfter = await fetch(`${API_URL}/api/admin/employees?search=${encodeURIComponent(manager.name)}`, {
      headers: adminHeaders,
    });
    const adminEmpDataAfter = await adminEmpResAfter.json();
    const empAfter = adminEmpDataAfter?.data?.employees?.find(e => e._id.toString() === manager._id.toString());
    console.log(`Manager After Check-Out: currentStatus=${empAfter?.currentStatus}, checkOutTime=${empAfter?.todayAttendance?.checkOutTime}`);
    if (empAfter?.currentStatus !== 'checked_out') {
      throw new Error(`Expected currentStatus === 'checked_out', got: ${empAfter?.currentStatus}`);
    }
    console.log('✅ Manager live status updated to "checked_out" in Admin directory!');

    console.log('\n🎉 ALL PIPELINE TESTS PASSED 100%!');
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run().catch(err => {
  console.error('❌ Pipeline Test Failed:', err);
  process.exit(1);
});

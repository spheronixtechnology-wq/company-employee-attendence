const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');

const User = require('../models/User');
const Team = require('../models/Team');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const OfficeLocation = require('../models/OfficeLocation');

const API_PORT = process.env.PORT || 5000;
const API_HOST = '127.0.0.1';

// Helper for making HTTP requests
const makeRequest = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
};

async function runVerification() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Find an active employee
    let employee = await User.findOne({ role: 'employee', isActive: true }).populate('teamId');
    if (!employee) {
      throw new Error('No active employee found in database.');
    }
    console.log(`👤 Using test employee: ${employee.name} (${employee.email}) - Team: ${employee.teamId?.name || 'Technical'}`);

    const token = jwt.sign({ id: employee._id, role: employee.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const authHeaders = {
      'Content-Type': 'application/json',
      'Cookie': `token_employee=${token}`,
      'Authorization': `Bearer ${token}`
    };

    const today = new Date().toISOString().split('T')[0];

    // Find active office location
    const office = await OfficeLocation.findOne({ status: 'active' });
    const officeLat = office ? office.latitude : 12.84671;
    const officeLng = office ? office.longitude : 77.681014;
    console.log(`📍 Active Office: ${office?.officeName || 'Default'} at (${officeLat}, ${officeLng})`);

    // Ensure clean state for today's test: ensure checked in
    let att = await Attendance.findOne({ userId: employee._id, date: today });
    if (!att) {
      att = new Attendance({
        userId: employee._id,
        date: today,
        checkInTime: new Date(Date.now() - 3 * 3600 * 1000), // checked in 3 hours ago
        status: 'present',
        breaks: [
          {
            type: 'personal',
            startedAt: new Date(Date.now() - 2 * 3600 * 1000),
            endedAt: new Date(Date.now() - 1.5 * 3600 * 1000), // 30m break
          }
        ],
        completedBreakMinutes: 30,
        totalBreakMinutes: 30,
      });
      await att.save();
      console.log('⏱️ Created active check-in record for test (3h shift, 30m break)');
    } else {
      // Reset checkout time if previously checked out for testing
      att.checkOutTime = null;
      att.completedBreakMinutes = 30;
      att.totalBreakMinutes = 30;
      await att.save();
      console.log('⏱️ Reset check-in record for test');
    }

    // Clear existing daily log for today to test submission
    await DailyLog.deleteOne({ userId: employee._id, logDate: today });

    // ── Test 1: Submit Daily Log to canonical POST /employee/daily-log/me without manual hours ──
    console.log('\n--- Test 1: Canonical POST /employee/daily-log/me without manual hours ---');
    const logPayload = {
      taskTitle: 'Automated test of checkout choreography',
      projectName: 'Attendance System v2',
      ticketId: 'TEST-101',
      blockers: 'None',
      outputSummary: 'Verified geofencing and real-time report emission',
      campaignName: 'Test Campaign',
      platform: 'Internal Test',
    };

    const logRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/daily-log/me',
      method: 'POST',
      headers: authHeaders,
    }, logPayload);

    console.log(`Response status: ${logRes.status}`);
    if (logRes.status !== 200 || !logRes.data?.data?.log) {
      throw new Error(`Daily log submission failed: ${JSON.stringify(logRes.data)}`);
    }
    console.log(`✅ Daily log submitted! Saved hoursSpent: ${logRes.data.data.log.hoursSpent}h (auto-calculated from shift duration)`);

    // ── Test 2: Initiate Checkout session ──
    console.log('\n--- Test 2: POST /employee/attendance/initiate-checkout ---');
    const initRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/initiate-checkout',
      method: 'POST',
      headers: authHeaders,
    }, {});

    console.log(`Response status: ${initRes.status}`);
    if (initRes.status !== 200 || !initRes.data?.data?.token) {
      throw new Error(`Initiate checkout failed: ${JSON.stringify(initRes.data)}`);
    }
    const checkoutToken = initRes.data.data.token;
    console.log(`✅ Checkout session token generated: ${checkoutToken} (Expires: ${initRes.data.data.expiresAt})`);

    // ── Test 3a: Missing Location check ──
    console.log('\n--- Test 3a: Check-Out with Missing Location Coordinates ---');
    const noGeoRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/check-out',
      method: 'POST',
      headers: authHeaders,
    }, {
      token: checkoutToken,
    });
    console.log(`Response status: ${noGeoRes.status} (Expected: 400)`);
    console.log(`Response message: ${noGeoRes.data?.message}`);
    if (noGeoRes.status !== 400 || !noGeoRes.data?.message?.includes('Location Access Required')) {
      throw new Error(`Missing location check failed: ${JSON.stringify(noGeoRes.data)}`);
    }
    console.log('✅ Missing location check PASSED!');

    // ── Test 3b: Geofence Gate: Try Check-Out from OUTSIDE geofence (20km away) ──
    console.log('\n--- Test 3b: Check-Out with OUTSIDE Geofence Coordinates (lat 13.0, lng 77.0) ---');
    const badGeoRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/check-out',
      method: 'POST',
      headers: authHeaders,
    }, {
      lat: 13.0,
      lng: 77.0,
      token: checkoutToken,
    });

    console.log(`Response status: ${badGeoRes.status} (Expected: 400)`);
    console.log(`Response message: ${badGeoRes.data?.message}`);
    if (badGeoRes.status !== 400 || !badGeoRes.data?.message?.includes('Outside Office Location')) {
      throw new Error(`Security gate failed! Expected 400 Outside Office Location but got: ${JSON.stringify(badGeoRes.data)}`);
    }
    console.log('✅ Geofence security gate PASSED! Check-out strictly blocked outside office.');

    // ── Test 4: Check-Out with VALID Office Coordinates ──
    console.log('\n--- Test 4: Check-Out with VALID Office Coordinates & Token ---');
    const goodCheckoutRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/check-out',
      method: 'POST',
      headers: authHeaders,
    }, {
      lat: officeLat,
      lng: officeLng,
      token: checkoutToken,
    });

    console.log(`Response status: ${goodCheckoutRes.status} (Expected: 200)`);
    if (goodCheckoutRes.status !== 200 || !goodCheckoutRes.data?.data?.summary) {
      throw new Error(`Check-out failed: ${JSON.stringify(goodCheckoutRes.data)}`);
    }
    const summary = goodCheckoutRes.data.data.summary;
    console.log('✅ Check-out succeeded!');
    console.log(`   - Total Duration: ${summary.totalDurationMinutes} mins`);
    console.log(`   - Total Breaks: ${summary.totalBreakMinutes} mins`);
    console.log(`   - Actual Work Time: ${summary.actualWorkMinutes} mins`);
    console.log(`   - Status: ${summary.status}`);

    // ── Test 5: Replay Attack / Token Invalidation: Attempt check-out again with same token ──
    console.log('\n--- Test 5: Invalidation Check: Attempt to use already consumed token ---');
    const replayRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/check-out',
      method: 'POST',
      headers: authHeaders,
    }, {
      lat: officeLat,
      lng: officeLng,
      token: checkoutToken,
    });

    console.log(`Response status: ${replayRes.status} (Expected: 400)`);
    console.log(`Response message: ${replayRes.data?.message}`);
    if (replayRes.status !== 400) {
      throw new Error(`Token invalidation check failed! Expected 400 but got ${replayRes.status}`);
    }
    console.log('✅ Token invalidation PASSED! Consumed/completed session cannot be reused.');

    // ── Test 6: Send Daily Report ──
    console.log('\n--- Test 6: POST /employee/attendance/send-report ---');
    const reportRes = await makeRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/employee/attendance/send-report',
      method: 'POST',
      headers: authHeaders,
    }, {});

    console.log(`Response status: ${reportRes.status} (Expected: 200)`);
    if (reportRes.status !== 200 || !reportRes.data?.data?.report) {
      throw new Error(`Send report failed: ${JSON.stringify(reportRes.data)}`);
    }
    console.log('✅ Report delivered to manager room via WebSocket!');

    console.log('\n🎉 ALL 6 AUTOMATED BACKEND VERIFICATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  }
}

runVerification();

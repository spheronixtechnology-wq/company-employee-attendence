require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const IntegrationCredential = require('../src/models/IntegrationCredential');
const { generateCredential } = require('../src/services/integrationCredential.service');

async function main() {
  await connectDB();

  // Find Super Admin
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('No admin found.');
    process.exit(1);
  }

  // Check if we already have an active frappe credential or generate a fresh one
  let rawKey = process.env.TEST_RAW_KEY;
  let cred = null;

  if (!rawKey) {
    console.log('Generating fresh live Integration Key for Frappe HRMS...');
    const result = await generateCredential({
      name: 'Frappe HRMS Production Gateway',
      environment: 'live',
      scopes: [
        'employees:read',
        'attendance-daily:read',
        'attendance-history:read',
        'attendance-events:read',
      ],
      expiresInDays: 90,
      createdBy: admin._id,
    });
    rawKey = result.rawKey;
    cred = result.credential;
    console.log('Successfully generated key:');
    console.log(`Key ID: ${cred.keyId}`);
    console.log(`Raw API Key: ${rawKey}`);
  }

  const baseUrl = 'http://localhost:5000/api/integrations/v1';

  async function callApi(endpoint, description) {
    console.log(`\n============================================================`);
    console.log(`📡 CALLING: ${description}`);
    console.log(`URL: ${baseUrl}${endpoint}`);
    console.log(`Header: Authorization: Bearer ${rawKey.substring(0, 25)}...`);
    console.log(`============================================================`);

    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${rawKey}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      console.log(`Status: ${res.status} ${res.statusText}`);
      console.log(`Response Payload:\n`, JSON.stringify(json, null, 2));
      return { status: res.status, data: json };
    } catch (err) {
      console.error(`Fetch error:`, err.message);
    }
  }

  const currentWatermark = new Date().toISOString();

  // 1. Ping
  await callApi('/ping', 'Gateway Health & Identity Ping');

  // 2. Employees Feed
  await callApi(`/employees?watermark=${currentWatermark}&limit=3`, 'Employees Feed (first 3 records)');

  // 3. Attendance Feed
  const attRes = await callApi(`/attendance?watermark=${currentWatermark}&limit=3`, 'Daily Attendance Feed (first 3 records)');

  // 4. Attendance Events Feed
  await callApi(`/attendance-events?watermark=${currentWatermark}&limit=3`, 'Attendance Events Feed (first 3 records)');

  // 5. Test Cursor Continuation if nextCursor is returned
  if (attRes?.data?.pagination?.nextCursor) {
    const nextCursor = encodeURIComponent(attRes.data.pagination.nextCursor);
    await callApi(`/attendance?watermark=${currentWatermark}&cursor=${nextCursor}&limit=3`, 'Attendance Feed (Continuation via Cursor Token)');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

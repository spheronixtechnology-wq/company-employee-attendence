require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const IntegrationCredential = require('../src/models/IntegrationCredential');
const { generateCredential } = require('../src/services/integrationCredential.service');

async function main() {
  await connectDB();

  // Revoke previous test credentials to keep DB clean
  await IntegrationCredential.updateMany(
    { name: 'Frappe HRMS Production Gateway' },
    { $set: { status: 'revoked' } }
  );

  const admin = await User.findOne({ role: 'admin' });

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

  console.log('=== ACTIVE PRODUCTION INTEGRATION CREDENTIAL ===');
  console.log(`Key ID:      ${result.credential.keyId}`);
  console.log(`Raw API Key: ${result.rawKey}`);
  console.log(`Scopes:      ${result.credential.scopes.join(', ')}`);
  console.log(`Expires At:  ${result.credential.expiresAt.toISOString()}`);
  console.log('================================================');

  process.exit(0);
}

main();

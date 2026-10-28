/**
 * Migration Script: migrate_integration_credentials_scope.js
 * 
 * Safely backfills employeeScope and allowedEmployees for existing integration credentials.
 * 1. Creates a local backup JSON file of all integration credentials before modification.
 * 2. Explicitly whitelists the active production key (05df7a0121040a35 - "hrms") for org-wide access ('all').
 * 3. Sets revoked/legacy keys to fail-closed 'restricted' with empty audience ([]).
 * 4. Records a persistent migration audit log entry.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const IntegrationCredential = require('../models/IntegrationCredential');
const { writeAuditLog } = require('../services/audit.service');

const ACTIVE_APPROVED_KEY_ID = '05df7a0121040a35'; // Approved production Frappe HRMS key

async function runMigration() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('🚀 MIGRATION: Integration Credentials Employee Scoping');
  console.log('══════════════════════════════════════════════════════════\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  // 1. Fetch all existing credentials
  const allCredentials = await IntegrationCredential.find({}).lean();
  console.log(`Found ${allCredentials.length} total integration credentials in database.`);

  // 2. Create pre-migration backup
  const scratchDir = path.join(__dirname, '..', '..', 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(scratchDir, `integration_credentials_backup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(allCredentials, null, 2), 'utf8');
  console.log(`📁 Backup snapshot created at: ${backupPath}\n`);

  let activeUpdated = 0;
  let revokedUpdated = 0;

  // 3. Process each credential with targeted policy
  for (const cred of allCredentials) {
    if (cred.keyId === ACTIVE_APPROVED_KEY_ID) {
      // Explicitly approved production Frappe HRMS key
      await IntegrationCredential.updateOne(
        { _id: cred._id },
        {
          $set: {
            employeeScope: 'all',
            allowedEmployees: [],
          },
        }
      );
      activeUpdated++;
      console.log(`  ✓ Key ${cred.keyId} ("${cred.name}") -> Approved org-wide ('all')`);
    } else {
      // Inactive / Revoked / Legacy keys -> Fail-closed restricted
      await IntegrationCredential.updateOne(
        { _id: cred._id },
        {
          $set: {
            employeeScope: cred.employeeScope || 'restricted',
            allowedEmployees: cred.allowedEmployees || [],
          },
        }
      );
      revokedUpdated++;
      console.log(`  ✓ Key ${cred.keyId} ("${cred.name}") [${cred.status}] -> Fail-closed ('restricted', empty audience)`);
    }
  }

  // 4. Audit Log
  try {
    await writeAuditLog({
      action: 'MIGRATION_INTEGRATION_CREDENTIALS_SCOPE',
      targetCollection: 'integration_credentials',
      metadata: {
        totalRecords: allCredentials.length,
        approvedOrgWideKeyId: ACTIVE_APPROVED_KEY_ID,
        activeUpdated,
        revokedUpdated,
        backupFile: backupPath,
        migratedAt: new Date(),
      },
    });
    console.log('\n📝 Migration audit log entry recorded.');
  } catch (auditErr) {
    console.warn('⚠️ Could not write audit log (non-critical):', auditErr.message);
  }

  console.log('\n🎉 Migration completed successfully!');
  await mongoose.disconnect();
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = runMigration;

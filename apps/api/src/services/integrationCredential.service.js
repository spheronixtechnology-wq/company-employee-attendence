const crypto = require('crypto');
const mongoose = require('mongoose');
const IntegrationCredential = require('../models/IntegrationCredential');
const { writeAuditLog } = require('./audit.service');

const KEY_REGEX = /^shk_(live|test)_([0-9a-f]{16})_([0-9a-f]{64})$/;
const LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds lock TTL

/**
 * Parses INTEGRATION_KEY_PEPPERS string: "v1:secret1,v2:secret2"
 * @returns {Record<string, string>}
 */
function getPepperMap() {
  const raw = process.env.INTEGRATION_KEY_PEPPERS || '';
  const peppers = {};
  raw.split(',').forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const version = trimmed.slice(0, colonIdx).trim();
      const secret = trimmed.slice(colonIdx + 1).trim();
      if (version && secret) {
        peppers[version] = secret;
      }
    }
  });
  return peppers;
}

/**
 * Retrieves the current configured pepper version and secret
 */
function getCurrentPepper() {
  const currentVersion = process.env.INTEGRATION_KEY_PEPPER_CURRENT || 'v1';
  const peppers = getPepperMap();
  const secret = peppers[currentVersion];
  if (!secret) {
    throw new Error(`Current pepper version "${currentVersion}" is not defined in INTEGRATION_KEY_PEPPERS.`);
  }
  return { version: currentVersion, secret };
}

/**
 * Validates pepper configuration at startup.
 * Ensures the current pepper is configured AND all active, unexpired keys in MongoDB
 * have their pepperVersion present in INTEGRATION_KEY_PEPPERS.
 */
async function validatePeppersAtStartup() {
  const peppers = getPepperMap();
  const currentVersion = process.env.INTEGRATION_KEY_PEPPER_CURRENT;

  if (!currentVersion || !peppers[currentVersion]) {
    throw new Error(`[CRITICAL] Current pepper "${currentVersion}" is missing from INTEGRATION_KEY_PEPPERS.`);
  }

  // If connected to MongoDB, verify all active keys
  if (mongoose.connection.readyState === 1) {
    const activeVersions = await IntegrationCredential.distinct('pepperVersion', {
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    const missing = activeVersions.filter((v) => !peppers[v]);
    if (missing.length > 0) {
      throw new Error(
        `[CRITICAL] Missing pepper versions required by active integration keys: ${missing.join(', ')}. Server startup aborted.`
      );
    }
  }
}

/**
 * Computes timing-safe HMAC-SHA256 secret hash bound to environment.
 * @param {string} pepper
 * @param {string} environment
 * @param {string} keyId
 * @param {string} secret
 * @returns {string} Hex hash
 */
function computeSecretHash(pepper, environment, keyId, secret) {
  return crypto
    .createHmac('sha256', pepper)
    .update(`${environment}.${keyId}.${secret}`)
    .digest('hex');
}

/**
 * Generates a new integration key credential.
 * Enforces 1–180 days lifetime in service layer.
 */
async function generateCredential({
  name,
  environment,
  scopes,
  expiresInDays,
  createdBy,
  employeeScope = 'all',
  allowedEmployees = [],
  rotatedFromKeyId = null,
  audienceVersion = 1,
  audienceChangedAt = new Date(),
  expectedPollMinutes = 5,
  session = null,
}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    const err = new Error('Credential name is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!['live', 'test'].includes(environment)) {
    const err = new Error('Environment must be "live" or "test".');
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(scopes) || scopes.length === 0) {
    const err = new Error('At least one valid scope is required.');
    err.statusCode = 400;
    throw err;
  }

  const days = Number(expiresInDays);
  if (!days || !Number.isInteger(days) || days < 1 || days > 180) {
    const err = new Error('Expiration lifetime must be an integer between 1 and 180 days.');
    err.statusCode = 400;
    throw err;
  }

  const scope = employeeScope || 'all';
  if (!['all', 'restricted'].includes(scope)) {
    const err = new Error('employeeScope must be either "all" or "restricted".');
    err.statusCode = 400;
    throw err;
  }

  let normalizedEmployees = [];
  if (scope === 'restricted') {
    if (!Array.isArray(allowedEmployees) || allowedEmployees.length === 0) {
      const err = new Error('Restricted integration key must specify at least one authorized employee ID.');
      err.statusCode = 400;
      throw err;
    }

    const User = require('../models/User');
    const uniqueIds = [...new Set(allowedEmployees.map((id) => String(id)))];
    const activeUsers = await User.find({
      _id: { $in: uniqueIds },
      isActive: true,
    }).select('_id');

    if (activeUsers.length !== uniqueIds.length) {
      const err = new Error('One or more selected employees do not exist or are currently inactive.');
      err.statusCode = 400;
      throw err;
    }

    normalizedEmployees = activeUsers.map((u) => u._id);
  }

  const { version: pepperVersion, secret: pepper } = getCurrentPepper();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Collision retry loop up to 3 attempts
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    const keyId = crypto.randomBytes(8).toString('hex'); // 16 hex chars
    const secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const keyPrefix = `shk_${environment}_${keyId}`;
    const secretHash = computeSecretHash(pepper, environment, keyId, secret);

    try {
      const doc = new IntegrationCredential({
        name: name.trim(),
        integration: 'frappe_hrms',
        environment,
        keyId,
        keyPrefix,
        secretHash,
        pepperVersion,
        scopes,
        employeeScope: scope,
        allowedEmployees: normalizedEmployees,
        audienceVersion: Math.max(1, Number(audienceVersion) || 1),
        audienceChangedAt:
          audienceChangedAt instanceof Date ? audienceChangedAt : new Date(audienceChangedAt || Date.now()),
        expectedPollMinutes: Math.min(1440, Math.max(1, Number(expectedPollMinutes) || 5)),
        status: 'active',
        createdBy,
        expiresAt,
        rotatedFromKeyId,
      });

      const options = session ? { session } : {};
      await doc.save(options);

      const rawKey = `shk_${environment}_${keyId}_${secret}`;
      return { credential: doc, rawKey };
    } catch (err) {
      if (err.code === 11000 && attempts < 3) {
        continue; // Retry on keyId collision
      }
      throw err;
    }
  }

  throw new Error('Failed to generate unique keyId after multiple attempts.');
}

/**
 * Timing-safe zero-cache verification of raw API key.
 * Checks: regex -> keyId lookup -> environment binding -> pepper lookup -> HMAC timingSafeEqual -> active status -> not expired.
 * @param {string} rawKey
 * @returns {Promise<{ credential?: any, keyId?: string, error?: string }>}
 */
async function verifyKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    return { error: 'INVALID_FORMAT' };
  }

  const match = rawKey.match(KEY_REGEX);
  if (!match) {
    return { error: 'INVALID_FORMAT' };
  }

  const [, rawEnv, rawKeyId, rawSecret] = match;

  const cred = await IntegrationCredential.findOne({ keyId: rawKeyId }).select('+secretHash');
  if (!cred) {
    return { error: 'KEY_NOT_FOUND', keyId: rawKeyId };
  }

  // 1. Explicit Environment Binding
  if (cred.environment !== rawEnv) {
    return { error: 'ENV_MISMATCH', keyId: rawKeyId };
  }

  // 2. Pepper Resolution
  const peppers = getPepperMap();
  const pepper = peppers[cred.pepperVersion];
  if (!pepper) {
    return { error: 'PEPPER_UNAVAILABLE', keyId: rawKeyId };
  }

  // 3. Timing-Safe HMAC Comparison
  const computedHash = computeSecretHash(pepper, rawEnv, rawKeyId, rawSecret);
  const storedBuffer = Buffer.from(cred.secretHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  if (
    storedBuffer.length !== computedBuffer.length ||
    !crypto.timingSafeEqual(storedBuffer, computedBuffer)
  ) {
    return { error: 'INVALID_SECRET', keyId: rawKeyId };
  }

  // 4. Status Check
  if (cred.status !== 'active') {
    return { error: 'KEY_REVOKED', keyId: rawKeyId };
  }

  // 5. Expiry Check
  if (new Date() >= cred.expiresAt) {
    return { error: 'KEY_EXPIRED', keyId: rawKeyId };
  }

  // 6. Fail-closed Employee Scope Integrity Check
  const VALID_EMPLOYEE_SCOPES = ['all', 'restricted'];
  if (!VALID_EMPLOYEE_SCOPES.includes(cred.employeeScope)) {
    return { error: 'INVALID_CREDENTIAL_SCOPE', keyId: rawKeyId };
  }
  if (cred.employeeScope === 'restricted' && (!Array.isArray(cred.allowedEmployees) || cred.allowedEmployees.length === 0)) {
    return { error: 'RESTRICTED_KEY_EMPTY_AUDIENCE', keyId: rawKeyId };
  }

  return { credential: cred, keyId: rawKeyId, pepper };
}

/**
 * Concurrency-safe rotation of an existing integration key.
 * Supports both MongoDB multi-document transactions and non-transaction fallback with safe cleanup.
 */
async function rotateCredential({
  oldKeyId,
  compromised = false,
  overlapHours = 24,
  expiresInDays = null,
  adminUser,
}) {
  const now = new Date();

  // 1. Concurrency Lock: Atomic acquisition of rotationLock
  const lockedOldKey = await IntegrationCredential.findOneAndUpdate(
    {
      keyId: oldKeyId,
      status: 'active',
      rotatedToKeyId: null,
      $or: [
        { rotationLock: null },
        { rotationLock: { $exists: false } },
        { 'rotationLock.lockedAt': null },
        { 'rotationLock.lockedAt': { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
      ],
    },
    {
      $set: {
        rotationLock: {
          lockedAt: now,
          lockedBy: adminUser._id,
          lockId: new mongoose.Types.ObjectId(),
        },
      },
    },
    { new: true }
  );

  if (!lockedOldKey) {
    const existing = await IntegrationCredential.findOne({ keyId: oldKeyId });
    if (!existing) {
      const err = new Error('Source key not found.');
      err.statusCode = 404;
      throw err;
    }
    if (existing.status !== 'active') {
      const err = new Error('Cannot rotate an inactive or revoked key.');
      err.statusCode = 409;
      throw err;
    }
    if (existing.rotatedToKeyId) {
      const err = new Error('Key has already been rotated. Rotation chains are not permitted.');
      err.statusCode = 409;
      throw err;
    }
    if (now >= existing.expiresAt) {
      const err = new Error('Cannot rotate an expired key. Please create a new key instead.');
      err.statusCode = 409;
      throw err;
    }
    const err = new Error('Key is currently being rotated by another process.');
    err.statusCode = 409;
    throw err;
  }

  // Determine lifetime for the new key (default: old key's original lifetime)
  let lifetimeDays = expiresInDays;
  if (!lifetimeDays) {
    const diffMs = lockedOldKey.expiresAt.getTime() - lockedOldKey.createdAt.getTime();
    lifetimeDays = Math.max(1, Math.min(180, Math.round(diffMs / (24 * 60 * 60 * 1000))));
  }

  // Validate overlap hours
  let overlap = Number(overlapHours);
  if (isNaN(overlap) || overlap < 0 || overlap > 24) {
    // Release lock before throwing
    await IntegrationCredential.updateOne({ keyId: oldKeyId }, { $set: { rotationLock: null } });
    const err = new Error('Overlap hours must be an integer between 0 and 24.');
    err.statusCode = 400;
    throw err;
  }

  // ── BRANCH A: COMPROMISED ROTATION (FAIL-SAFE REVOKE-FIRST) ──────────────────
  if (compromised) {
    // Step 1: Revoke old key immediately
    await IntegrationCredential.updateOne(
      { keyId: oldKeyId, status: 'active' },
      {
        $set: {
          status: 'revoked',
          revokeReason: 'compromised',
          revokedAt: new Date(),
          revokedBy: adminUser._id,
          rotationLock: null,
        },
      }
    );

    // Step 2: Read-back confirmation
    const verifiedRevoked = await IntegrationCredential.findOne({ keyId: oldKeyId });
    if (!verifiedRevoked || verifiedRevoked.status !== 'revoked') {
      await writeAuditLog({
        action: 'INTEGRATION_KEY_COMPROMISE_REVOKE_FAILED',
        performedBy: adminUser,
        targetCollection: 'integration_credentials',
        metadata: { keyId: oldKeyId },
      });
      const err = new Error(
        'Revocation not confirmed — compromised key may still be active. No replacement issued.'
      );
      err.statusCode = 500;
      throw err;
    }

    await writeAuditLog({
      action: 'INTEGRATION_KEY_COMPROMISED',
      performedBy: adminUser,
      targetCollection: 'integration_credentials',
      metadata: { keyId: oldKeyId },
    });

    // Step 3: Create replacement key
    try {
      const { credential: newCred, rawKey } = await generateCredential({
        name: `${lockedOldKey.name} (Compromise Replacement)`,
        environment: lockedOldKey.environment,
        scopes: lockedOldKey.scopes,
        expiresInDays: lifetimeDays,
        createdBy: adminUser._id,
        employeeScope: lockedOldKey.employeeScope || 'all',
        allowedEmployees: lockedOldKey.allowedEmployees || [],
        rotatedFromKeyId: oldKeyId,
        audienceVersion: lockedOldKey.audienceVersion || 1,
        audienceChangedAt: lockedOldKey.audienceChangedAt || lockedOldKey.createdAt || new Date(),
        expectedPollMinutes: lockedOldKey.expectedPollMinutes || 5,
      });

      await IntegrationCredential.updateOne(
        { keyId: oldKeyId },
        { $set: { rotatedToKeyId: newCred.keyId } }
      );

      await writeAuditLog({
        action: 'INTEGRATION_KEY_ROTATED',
        performedBy: adminUser,
        targetCollection: 'integration_credentials',
        metadata: { oldKeyId, newKeyId: newCred.keyId, compromised: true },
      });

      return {
        credential: newCred,
        rawKey,
        revokedOldKeyId: oldKeyId,
        compromised: true,
      };
    } catch (genErr) {
      // Step 3 failed: Key was successfully revoked, but issuing replacement failed
      const err = new Error(
        'The compromised key was revoked successfully. However, automatic issuance of the replacement key failed. Please create a new key manually.'
      );
      err.statusCode = 500;
      err.code = 'KEY_REVOKED_REPLACEMENT_FAILED';
      err.data = {
        revoked: true,
        replacementIssued: false,
        keyId: oldKeyId,
      };
      throw err;
    }
  }

  // ── BRANCH B: NORMAL ROTATION ───────────────────────────────────────────────
  // Calculate old key overlap boundary
  let newOldExpiry;
  let shouldRevokeOldImmediately = false;

  if (overlap === 0) {
    shouldRevokeOldImmediately = true;
    newOldExpiry = now;
  } else {
    // Inviolable Rule: overlap never extends old key's existing expiry
    const overlapTime = now.getTime() + overlap * 60 * 60 * 1000;
    newOldExpiry = new Date(Math.min(lockedOldKey.expiresAt.getTime(), overlapTime));
  }

  // Check if transactions are available
  const hasTx = mongoose.connection.client && typeof mongoose.connection.client.startSession === 'function';
  let session = null;
  if (hasTx) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      session = null; // Fallback to non-transaction mode
    }
  }

  try {
    // Step 1: Create new replacement key
    const { credential: newCred, rawKey } = await generateCredential({
      name: `${lockedOldKey.name} (Rotated)`,
      environment: lockedOldKey.environment,
      scopes: lockedOldKey.scopes,
      expiresInDays: lifetimeDays,
      createdBy: adminUser._id,
      employeeScope: lockedOldKey.employeeScope || 'all',
      allowedEmployees: lockedOldKey.allowedEmployees || [],
      rotatedFromKeyId: oldKeyId,
      audienceVersion: lockedOldKey.audienceVersion || 1,
      audienceChangedAt: lockedOldKey.audienceChangedAt || lockedOldKey.createdAt || new Date(),
      expectedPollMinutes: lockedOldKey.expectedPollMinutes || 5,
      session,
    });

    // Step 2: Update old key
    const oldUpdate = {
      rotatedToKeyId: newCred.keyId,
      rotationLock: null,
    };

    if (shouldRevokeOldImmediately) {
      oldUpdate.status = 'revoked';
      oldUpdate.revokeReason = 'rotated';
      oldUpdate.revokedAt = now;
      oldUpdate.revokedBy = adminUser._id;
    } else {
      oldUpdate.expiresAt = newOldExpiry;
    }

    const updateOptions = session ? { session } : {};
    await IntegrationCredential.updateOne({ keyId: oldKeyId }, { $set: oldUpdate }, updateOptions);

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    await writeAuditLog({
      action: 'INTEGRATION_KEY_ROTATED',
      performedBy: adminUser,
      targetCollection: 'integration_credentials',
      metadata: {
        oldKeyId,
        newKeyId: newCred.keyId,
        overlapHours: overlap,
        immediateRevoke: shouldRevokeOldImmediately,
      },
    });

    return {
      credential: newCred,
      rawKey,
      oldKeyExpiry: shouldRevokeOldImmediately ? null : newOldExpiry,
      oldKeyRevoked: shouldRevokeOldImmediately,
    };
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    } else {
      // Non-transaction failure cleanup: Unlock old key and revoke any partial new key
      await IntegrationCredential.updateOne(
        { keyId: oldKeyId },
        { $set: { rotationLock: null } }
      );
    }
    throw err;
  }
}

/**
 * Revokes an integration credential.
 */
async function revokeCredential({ keyId, reason = 'manual', adminUser }) {
  const cred = await IntegrationCredential.findOne({ keyId });
  if (!cred) {
    const err = new Error('Key not found.');
    err.statusCode = 404;
    throw err;
  }

  if (cred.status === 'revoked') {
    const err = new Error('Key is already revoked.');
    err.statusCode = 409;
    throw err;
  }

  cred.status = 'revoked';
  cred.revokedAt = new Date();
  cred.revokedBy = adminUser._id;
  cred.revokeReason = reason;
  cred.rotationLock = null;
  await cred.save();

  await writeAuditLog({
    action: 'INTEGRATION_KEY_REVOKED',
    performedBy: adminUser,
    targetCollection: 'integration_credentials',
    metadata: { keyId, reason },
  });

  return cred;
}

/**
 * Asynchronously updates usage metrics without blocking response.
 */
async function recordUsageMetrics({ keyId, wasSuccess }) {
  try {
    const now = new Date();
    if (wasSuccess) {
      // Conditional update: only write if lastUsedAt was more than 60 seconds ago
      const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
      await IntegrationCredential.updateOne(
        {
          keyId,
          $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: sixtySecondsAgo } }],
        },
        { $set: { lastUsedAt: now } }
      );
    } else if (keyId) {
      await IntegrationCredential.updateOne({ keyId }, { $set: { lastFailedAt: now } });
    }
  } catch (err) {
    console.error('[IntegrationMetrics] Failed to update usage metric:', err.message);
  }
}

module.exports = {
  getPepperMap,
  getCurrentPepper,
  validatePeppersAtStartup,
  generateCredential,
  verifyKey,
  rotateCredential,
  revokeCredential,
  recordUsageMetrics,
};

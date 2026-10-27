const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const StepUpGrant = require('../models/StepUpGrant');
const IntegrationCredential = require('../models/IntegrationCredential');
const IntegrationRequestLog = require('../models/IntegrationRequestLog');
const integrationCredentialService = require('../services/integrationCredential.service');
const syncHealthService = require('../services/syncHealth.service');
const { writeAuditLog } = require('../services/audit.service');
const { verifyTotp } = require('../utils/mfaUtils');
const { getClientIp } = require('../utils/ipUtils');

/**
 * Rate Limiter for Step-Up Challenge
 * 5 attempts per 15 minutes per admin user and per IP.
 */
const stepUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.user?._id || 'anon'}_${getClientIp(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many step-up verification attempts. Please try again in 15 minutes.',
  },
});

/**
 * POST /api/admin/auth/step-up
 * Verifies admin password and optional TOTP, then issues a single-use 5-minute step-up token.
 */
const stepUpChallenge = async (req, res) => {
  const { password, otp, operation, targetKeyId } = req.body;

  if (!password || !operation) {
    return res.status(400).json({
      success: false,
      message: 'Password and operation are required for step-up verification.',
    });
  }

  const validOperations = [
    'integration_key:create',
    'integration_key:rotate',
    'integration_key:revoke',
    'integration_key:update_audience',
  ];
  if (!validOperations.includes(operation)) {
    return res.status(400).json({
      success: false,
      message: `Invalid operation "${operation}".`,
    });
  }

  // Pre-validate targetKeyId if rotating, revoking, or updating audience
  if (['integration_key:rotate', 'integration_key:revoke', 'integration_key:update_audience'].includes(operation)) {
    if (!targetKeyId) {
      return res.status(400).json({
        success: false,
        message: 'targetKeyId is required for key rotation or revocation.',
      });
    }
    const targetKey = await IntegrationCredential.findOne({ keyId: targetKeyId });
    if (!targetKey) {
      return res.status(404).json({
        success: false,
        message: 'Target integration key not found.',
      });
    }
  }

  // Fetch admin user with passwordHash and mfaSecret
  const admin = await User.findById(req.user._id).select('+passwordHash +mfaSecret');
  if (!admin) {
    return res.status(404).json({ success: false, message: 'Admin account not found.' });
  }

  // Verify password
  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    await writeAuditLog({
      action: 'STEP_UP_FAILED',
      performedBy: admin,
      targetCollection: 'integration_credentials',
      metadata: { operation, targetKeyId, reason: 'Invalid password' },
    });
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials. Password confirmation failed.',
    });
  }

  // Check TOTP requirement if admin has MFA enabled
  let mfaUsed = false;
  if (admin.mfaEnabled) {
    if (!otp || typeof otp !== 'string' || !otp.trim()) {
      return res.status(400).json({
        success: false,
        message: 'MFA authentication code is required for your account.',
      });
    }

    const isTotpValid = verifyTotp(otp.trim(), admin.mfaSecret);
    if (!isTotpValid) {
      await writeAuditLog({
        action: 'STEP_UP_FAILED',
        performedBy: admin,
        targetCollection: 'integration_credentials',
        metadata: { operation, targetKeyId, reason: 'Invalid TOTP code' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid MFA authentication code.',
      });
    }
    mfaUsed = true;
  }

  // Generate Step-Up Grant
  const jti = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

  await StepUpGrant.create({
    jti,
    userId: admin._id,
    tokenVersion: admin.tokenVersion || 0,
    operation,
    targetKeyId: targetKeyId || null,
    expiresAt,
  });

  const tokenPayload = {
    type: 'step_up',
    jti,
    sub: admin._id,
    tv: admin.tokenVersion || 0,
    op: operation,
    tgt: targetKeyId || null,
  };

  const stepUpJwt = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '5m' });

  await writeAuditLog({
    action: 'STEP_UP_SUCCESS',
    performedBy: admin,
    targetCollection: 'integration_credentials',
    metadata: { operation, targetKeyId, mfaUsed },
  });

  // Never cache response containing token
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    success: true,
    message: 'Step-up authentication successful.',
    data: {
      token: stepUpJwt,
      mfaUsed,
    },
  });
};

/**
 * GET /api/admin/integrations/frappe-hrms/keys
 * Lists metadata for all Frappe HRMS integration credentials.
 */
const listKeys = async (req, res) => {
  const keys = await IntegrationCredential.find({ integration: 'frappe_hrms' })
    .populate('allowedEmployees', '_id name email employeeId department designation')
    .sort({ createdAt: -1 })
    .lean();

  const formatted = keys.map((key) => ({
    name: key.name,
    environment: key.environment,
    keyId: key.keyId,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    employeeScope: key.employeeScope || 'all',
    allowedEmployees: key.allowedEmployees || [],
    allowedEmployeeCount: key.employeeScope === 'restricted' ? (key.allowedEmployees?.length || 0) : 'all',
    status: key.status,
    expiresAt: key.expiresAt,
    isExpired: new Date() >= new Date(key.expiresAt),
    lastUsedAt: key.lastUsedAt,
    lastFailedAt: key.lastFailedAt,
    revokedAt: key.revokedAt,
    revokeReason: key.revokeReason,
    rotatedFromKeyId: key.rotatedFromKeyId,
    rotatedToKeyId: key.rotatedToKeyId,
    audienceVersion: key.audienceVersion || 1,
    audienceChangedAt: key.audienceChangedAt || key.createdAt,
    expectedPollMinutes: key.expectedPollMinutes || 5,
    createdAt: key.createdAt,
  }));

  res.json({
    success: true,
    data: formatted,
  });
};

/**
 * POST /api/admin/integrations/frappe-hrms/keys
 * Protected by requireStepUp('integration_key:create'). Returns raw key once.
 */
const createKey = async (req, res) => {
  const { name, environment, scopes, expiresInDays, employeeScope, allowedEmployees } = req.body;
  let credentialCreated = false;

  try {
    const { credential, rawKey } = await integrationCredentialService.generateCredential({
      name,
      environment,
      scopes,
      expiresInDays: Number(expiresInDays),
      createdBy: req.user._id,
      employeeScope: employeeScope || 'all',
      allowedEmployees: allowedEmployees || [],
    });
    credentialCreated = true;

    await writeAuditLog({
      action: 'INTEGRATION_KEY_CREATED',
      performedBy: req.user,
      targetCollection: 'integration_credentials',
      metadata: {
        keyId: credential.keyId,
        environment,
        scopes,
        employeeScope: credential.employeeScope,
        allowedEmployeeCount: credential.allowedEmployees?.length || 0,
        expiresInDays,
      },
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(201).json({
      success: true,
      message: 'Integration key generated successfully. Save this key now; it will never be shown again.',
      data: {
        credential: {
          name: credential.name,
          environment: credential.environment,
          keyId: credential.keyId,
          keyPrefix: credential.keyPrefix,
          scopes: credential.scopes,
          employeeScope: credential.employeeScope,
          allowedEmployees: credential.allowedEmployees,
          status: credential.status,
          expiresAt: credential.expiresAt,
          createdAt: credential.createdAt,
        },
        rawKey,
      },
    });
  } catch (err) {
    // Failure recovery: if step-up grant was consumed but credential creation threw an unexpected error, rollback the grant
    if (req.stepUpGrant && !credentialCreated) {
      await StepUpGrant.updateOne(
        { _id: req.stepUpGrant._id, consumedAt: { $ne: null } },
        { $set: { consumedAt: null } }
      ).catch((rbErr) => console.error('[StepUp] Failed to release grant on system error:', rbErr.message));
    }

    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to create integration key.',
    });
  }
};

/**
 * POST /api/admin/integrations/keys/:keyId/rotate
 * Protected by requireStepUp('integration_key:rotate').
 */
const rotateKey = async (req, res) => {
  const { keyId } = req.params;
  const { compromised, overlapHours, expiresInDays } = req.body;

  try {
    const result = await integrationCredentialService.rotateCredential({
      oldKeyId: keyId,
      compromised: Boolean(compromised),
      overlapHours: overlapHours !== undefined ? Number(overlapHours) : 24,
      expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      adminUser: req.user,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      success: true,
      message: compromised
        ? 'Compromised key revoked immediately and replacement key generated.'
        : 'Integration key rotated successfully.',
      data: {
        credential: {
          name: result.credential.name,
          environment: result.credential.environment,
          keyId: result.credential.keyId,
          keyPrefix: result.credential.keyPrefix,
          scopes: result.credential.scopes,
          employeeScope: result.credential.employeeScope,
          allowedEmployees: result.credential.allowedEmployees,
          status: result.credential.status,
          expiresAt: result.credential.expiresAt,
          createdAt: result.credential.createdAt,
        },
        rawKey: result.rawKey,
        oldKeyExpiry: result.oldKeyExpiry,
        oldKeyRevoked: result.oldKeyRevoked,
      },
    });
  } catch (err) {
    if (err.code === 'KEY_REVOKED_REPLACEMENT_FAILED') {
      return res.status(500).json({
        success: false,
        code: 'KEY_REVOKED_REPLACEMENT_FAILED',
        message: err.message,
        data: err.data,
      });
    }

    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to rotate integration key.',
    });
  }
};

/**
 * POST /api/admin/integrations/keys/:keyId/revoke
 * Protected by requireStepUp('integration_key:revoke').
 */
const revokeKey = async (req, res) => {
  const { keyId } = req.params;
  const { reason } = req.body;

  try {
    const credential = await integrationCredentialService.revokeCredential({
      keyId,
      reason: reason || 'manual',
      adminUser: req.user,
    });

    res.json({
      success: true,
      message: 'Integration key revoked successfully.',
      data: {
        keyId: credential.keyId,
        status: credential.status,
        revokedAt: credential.revokedAt,
        revokeReason: credential.revokeReason,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to revoke integration key.',
    });
  }
};

/**
 * GET /api/admin/integrations/keys/:keyId/activity
 * Paged request log for a specific keyId.
 */
const getKeyActivity = async (req, res) => {
  const { keyId } = req.params;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  try {
    const [logs, total] = await Promise.all([
      IntegrationRequestLog.find({ keyId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      IntegrationRequestLog.countDocuments({ keyId }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve key activity logs.',
    });
  }
};

/**
 * PUT /api/admin/integrations/keys/:keyId/audience
 * Updates employee audience for an active integration key.
 * Protected by step-up MFA ('integration_key:update_audience').
 */
const updateKeyAudience = async (req, res, next) => {
  try {
    const { keyId } = req.params;
    const { employeeScope, allowedEmployees } = req.body;

    const updated = await integrationCredentialService.updateAudience({
      keyId,
      employeeScope,
      allowedEmployees,
      adminUser: req.user,
    });

    const populated = await IntegrationCredential.findById(updated._id)
      .populate('allowedEmployees', '_id name email employeeId department designation')
      .lean();

    res.json({
      success: true,
      message: 'Integration key audience updated successfully.',
      data: {
        keyId: populated.keyId,
        name: populated.name,
        employeeScope: populated.employeeScope,
        allowedEmployees: populated.allowedEmployees || [],
        allowedEmployeeCount:
          populated.employeeScope === 'restricted' ? (populated.allowedEmployees?.length || 0) : 'all',
        audienceVersion: populated.audienceVersion,
        audienceChangedAt: populated.audienceChangedAt,
        expectedPollMinutes: populated.expectedPollMinutes,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code || 'AUDIENCE_UPDATE_FAILED',
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    next(err);
  }
};

/**
 * GET /api/admin/integrations/frappe-hrms/keys/sync-health
 * Batched sync health evaluation for all Frappe HRMS integration keys.
 */
const getSyncHealth = async (req, res, next) => {
  try {
    const keys = await IntegrationCredential.find({ integration: 'frappe_hrms' })
      .select('name keyId scopes employeeScope expectedPollMinutes status expiresAt')
      .lean();

    const keyIds = keys.map((k) => k.keyId);
    const feedStatsMap = await syncHealthService.getFeedStats(keyIds);

    const now = new Date();
    const results = keys.map((key) => {
      const stats = feedStatsMap.get(key.keyId) || [];
      return syncHealthService.evaluateSyncHealth({ key, feedStats: stats, now });
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/admin/integrations/keys/:keyId/settings
 * Operational settings update (e.g. expectedPollMinutes).
 * Protected by standard isAdmin JWT authentication (no step-up MFA needed).
 */
const updateKeySettings = async (req, res, next) => {
  try {
    const { keyId } = req.params;
    const { expectedPollMinutes } = req.body;

    if (
      expectedPollMinutes === undefined ||
      isNaN(expectedPollMinutes) ||
      parseInt(expectedPollMinutes, 10) < 1 ||
      parseInt(expectedPollMinutes, 10) > 1440
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_POLL_MINUTES',
        message: 'expectedPollMinutes must be an integer between 1 and 1440 (1 minute to 24 hours).',
      });
    }

    const pollMinutes = parseInt(expectedPollMinutes, 10);

    const cred = await IntegrationCredential.findOneAndUpdate(
      { keyId },
      { $set: { expectedPollMinutes: pollMinutes } },
      { new: true }
    );

    if (!cred) {
      return res.status(404).json({
        success: false,
        code: 'KEY_NOT_FOUND',
        message: 'Integration key not found.',
      });
    }

    await writeAuditLog({
      action: 'INTEGRATION_KEY_SETTINGS_UPDATED',
      performedBy: req.user,
      targetCollection: 'integration_credentials',
      metadata: { keyId, expectedPollMinutes: pollMinutes },
    });

    res.json({
      success: true,
      message: 'Integration key settings updated successfully.',
      data: {
        keyId: cred.keyId,
        name: cred.name,
        expectedPollMinutes: cred.expectedPollMinutes,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  stepUpLimiter,
  stepUpChallenge,
  listKeys,
  createKey,
  rotateKey,
  revokeKey,
  getKeyActivity,
  updateKeyAudience,
  getSyncHealth,
  updateKeySettings,
};

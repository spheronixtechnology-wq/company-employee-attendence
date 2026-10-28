const jwt = require('jsonwebtoken');
const StepUpGrant = require('../models/StepUpGrant');
const User = require('../models/User');
const { validateAudienceInput } = require('../utils/audienceValidation');
const { validateScopesInput } = require('../utils/scopeValidation');

/**
 * Middleware factory: requireStepUp(operation)
 * Enforces single-use, atomic step-up authorization for critical integration key actions.
 * @param {'integration_key:create' | 'integration_key:rotate' | 'integration_key:revoke' | 'integration_key:update_audience' | 'integration_key:update_scopes'} operation
 */
const requireStepUp = (operation) => {
  return async (req, res, next) => {
    const stepUpToken = req.headers['x-step-up-token'];

    if (!stepUpToken) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_REQUIRED',
        message: 'Step-up authentication required for this operation. Please confirm your credentials.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(stepUpToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_TOKEN_INVALID',
        message: 'Invalid or expired step-up token. Please authenticate again.',
      });
    }

    // 1. Verify token type and claims binding
    if (decoded.type !== 'step_up') {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_INVALID_TYPE',
        message: 'Provided token is not a valid step-up grant.',
      });
    }

    if (String(decoded.sub) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_USER_MISMATCH',
        message: 'Step-up token was issued to a different user.',
      });
    }

    const currentTokenVersion = req.user.tokenVersion || 0;
    if (decoded.tv !== currentTokenVersion) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_SESSION_STALE',
        message: 'Your admin session or credentials have changed. Please step up again.',
      });
    }

    if (decoded.op !== operation) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_OP_MISMATCH',
        message: `Step-up token was issued for "${decoded.op}", not "${operation}".`,
      });
    }

    // If route specifies a keyId (e.g., rotate, revoke, or update_audience), ensure target matches
    if (req.params.keyId && decoded.tgt !== req.params.keyId) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_TARGET_MISMATCH',
        message: 'Step-up token was issued for a different integration key.',
      });
    }

    // 2. Pre-validate request body parameters so malformed input doesn't burn the grant
    if (operation === 'integration_key:create') {
      const { name, environment, scopes, expiresInDays, employeeScope, allowedEmployees } = req.body;
      if (!name || !environment || !Array.isArray(scopes) || !expiresInDays) {
        return res.status(400).json({
          success: false,
          message: 'Missing required creation fields: name, environment, scopes, and expiresInDays are required.',
        });
      }

      const scope = employeeScope || 'all';
      const validation = await validateAudienceInput({ employeeScope: scope, allowedEmployees });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          code: validation.code,
          message: validation.message,
          ...(validation.details ? { details: validation.details } : {}),
        });
      }
    } else if (operation === 'integration_key:update_audience') {
      const { employeeScope, allowedEmployees } = req.body;
      const validation = await validateAudienceInput({ employeeScope, allowedEmployees });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          code: validation.code,
          message: validation.message,
          ...(validation.details ? { details: validation.details } : {}),
        });
      }
    } else if (operation === 'integration_key:update_scopes') {
      const validation = validateScopesInput(req.body.scopes);
      if (!validation.valid) {
        return res.status(400).json({ success: false, code: validation.code, message: validation.message });
      }
    } else if (operation === 'integration_key:rotate') {
      const { overlapHours, expiresInDays } = req.body;
      if (overlapHours !== undefined && (isNaN(overlapHours) || overlapHours < 0 || overlapHours > 24)) {
        return res.status(400).json({
          success: false,
          message: 'Overlap hours must be an integer between 0 and 24.',
        });
      }
      if (expiresInDays !== undefined && (isNaN(expiresInDays) || expiresInDays < 1 || expiresInDays > 180)) {
        return res.status(400).json({
          success: false,
          message: 'Expires in days must be an integer between 1 and 180.',
        });
      }
    }

    // 3. Atomically consume the grant in MongoDB (Single-use, anti-replay, anti-expiry)
    const now = new Date();
    const query = {
      jti: decoded.jti,
      userId: req.user._id,
      operation,
      consumedAt: null,
      expiresAt: { $gt: now },
    };

    if (decoded.tgt) {
      query.targetKeyId = decoded.tgt;
    }

    const grant = await StepUpGrant.findOneAndUpdate(query, { $set: { consumedAt: now } });

    if (!grant) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_GRANT_EXPIRED_OR_USED',
        message: 'Invalid, expired, or already used step-up grant. Please confirm your credentials again.',
      });
    }

    req.stepUpGrant = grant;
    next();
  };
};

module.exports = requireStepUp;

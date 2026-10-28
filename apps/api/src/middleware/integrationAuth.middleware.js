const { verifyKey, recordUsageMetrics } = require('../services/integrationCredential.service');

/**
 * Middleware: integrationApiKeyAuth
 * Authenticates requests presenting a Frappe HRMS integration API key.
 * Enforces timing-safe verification, environment binding, zero-cache instant revocation, and updates metrics.
 */
const integrationApiKeyAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  if (!rawKey) {
    return res.status(401).json({
      success: false,
      message: 'Integration API key is required.',
      requestId: req.id,
    });
  }

  try {
    const result = await verifyKey(rawKey);

    if (result.error) {
      // Record failed authentication metric if keyId was parseable
      if (result.keyId) {
        recordUsageMetrics({ keyId: result.keyId, wasSuccess: false });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired integration API key.',
        requestId: req.id,
      });
    }

    // Record usage metric asynchronously (fire-and-forget)
    recordUsageMetrics({ keyId: result.keyId, wasSuccess: true });

    // Attach verified integration identity to request
    req.integration = {
      credential: result.credential,
      keyId: result.keyId,
      scopes: result.credential.scopes,
      environment: result.credential.environment,
      pepper: result.pepper,
    };

    next();
  } catch (err) {
    console.error('[integrationApiKeyAuth] Unexpected error during verification:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal error during authentication.',
      requestId: req.id,
    });
  }
};

/**
 * Helper middleware generator: requireScope(scope)
 * Verifies that the authenticated integration credential possesses the requested permission scope.
 */
const requireScope = (scope) => {
  return (req, res, next) => {
    if (!req.integration || !Array.isArray(req.integration.scopes)) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking scopes.',
        requestId: req.id,
      });
    }

    if (!req.integration.scopes.includes(scope)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Credential lacks required scope "${scope}".`,
        requestId: req.id,
      });
    }

    next();
  };
};

module.exports = {
  integrationApiKeyAuth,
  requireScope,
};

const rateLimit = require('express-rate-limit');
const { getClientIp } = require('../utils/ipUtils');

const KEY_REGEX = /^shk_(live|test)_([0-9a-f]{16})_([0-9a-f]{64})$/;

/**
 * Extracts keyId from Authorization header if present and well-formed.
 */
const extractKeyIdMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const match = token.match(KEY_REGEX);
  req.extractedKeyId = match ? match[2] : 'unparsed_or_missing_key';
  next();
};

/**
 * Tier 1: Route-Wide Failed-Auth Limiter
 * 100 failed auth attempts / 5 minutes across the entire integration gateway.
 */
const routeWideFailedAuthLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  keyGenerator: () => 'route_wide_failed_auth',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Global gateway rate limit exceeded for failed authentication. Please wait 5 minutes.',
  },
});

/**
 * Tier 2: Client IP Failed-Auth Limiter
 * 20 failed auth attempts / 15 minutes per client IP.
 */
const ipFailedAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => getClientIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed authentication attempts from this IP. Please wait 15 minutes.',
  },
});

/**
 * Tier 3: Per-KeyId Failed-Auth Limiter
 * 10 failed auth attempts / 10 minutes keyed by the presented keyId.
 * Runs before cryptographic verification to throttle brute-force attacks on a specific keyId.
 */
const keyIdFailedAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `failed_key_${req.extractedKeyId || 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed authentication attempts against this key ID. Please wait 10 minutes.',
  },
});

/**
 * Tier 4: Authenticated Per-Key Throughput Limiter
 * 300 requests / minute per valid authenticated keyId.
 */
const authenticatedPerKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: (req) => `auth_key_${req.integration?.keyId || 'unauthenticated'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit exceeded for this integration key (300 requests per minute).',
  },
});

module.exports = {
  extractKeyIdMiddleware,
  routeWideFailedAuthLimiter,
  ipFailedAuthLimiter,
  keyIdFailedAuthLimiter,
  authenticatedPerKeyLimiter,
};

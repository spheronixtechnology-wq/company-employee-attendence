const express = require('express');
const { v4: uuidv4 } = require('uuid');
const IntegrationRequestLog = require('../models/IntegrationRequestLog');
const { getClientIp } = require('../utils/ipUtils');
const {
  extractKeyIdMiddleware,
  routeWideFailedAuthLimiter,
  ipFailedAuthLimiter,
  keyIdFailedAuthLimiter,
  authenticatedPerKeyLimiter,
} = require('../middleware/integrationRateLimiter');
const { integrationApiKeyAuth, requireScope } = require('../middleware/integrationAuth.middleware');
const integrationFeedController = require('../controllers/integrationFeed.controller');

const router = express.Router();

// ── 1. Request ID Middleware ──────────────────────────────────────────────────
router.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// ── 2. Request Logging Middleware (Audit 90-day retention) ───────────────────
router.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const keyId = req.integration?.keyId || req.extractedKeyId || 'unauthenticated';
    const clientIp = getClientIp(req);

    // Asynchronously persist log without blocking response
    IntegrationRequestLog.create({
      keyId,
      method: req.method,
      route: req.baseUrl + req.path,
      status: res.statusCode,
      durationMs,
      requestId: req.id,
      ip: clientIp,
    }).catch((err) => {
      console.error('[IntegrationLog] Failed to persist request log:', err.message);
    });
  });

  next();
});

// ── 3. Multi-Tier Pre-Auth Rate Limiting ─────────────────────────────────────
router.use(routeWideFailedAuthLimiter);
router.use(ipFailedAuthLimiter);
router.use(extractKeyIdMiddleware);
router.use(keyIdFailedAuthLimiter);

// ── 4. Cryptographic Authentication ──────────────────────────────────────────
router.use(integrationApiKeyAuth);

// ── 5. Authenticated Per-Key Throughput Rate Limiting ────────────────────────
router.use(authenticatedPerKeyLimiter);

// ── 6. Stage 1 Route: GET /ping ──────────────────────────────────────────────
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    data: {
      name: req.integration.credential.name,
      environment: req.integration.environment,
      scopes: req.integration.scopes,
      employeeScope: req.integration.credential.employeeScope || 'all',
      allowedEmployeeCount:
        req.integration.credential.employeeScope === 'restricted'
          ? (req.integration.credential.allowedEmployees?.length || 0)
          : 'all',
      expiresAt: req.integration.credential.expiresAt,
      serverTime: new Date().toISOString(),
      audienceVersion: req.integration.credential.audienceVersion || 1,
      audienceChangedAt: req.integration.credential.audienceChangedAt || req.integration.credential.createdAt || null,
      expectedPollMinutes: req.integration.credential.expectedPollMinutes || 5,
    },
  });
});

// ── 7. Stage 2 Feed Routes (Scoped, Cursor-Paginated, Watermarked) ───────────
router.get('/attendance', requireScope('attendance-daily:read'), integrationFeedController.getAttendanceFeed);
router.get('/employees', requireScope('employees:read'), integrationFeedController.getEmployeesFeed);
router.get('/attendance-events', requireScope('attendance-events:read'), integrationFeedController.getAttendanceEventsFeed);

// ── 8. Isolated Router Error Handler ─────────────────────────────────────────
router.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal integration error.',
    requestId: req.id,
  });
});

module.exports = router;

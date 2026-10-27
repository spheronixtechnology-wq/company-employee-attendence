const IntegrationRequestLog = require('../models/IntegrationRequestLog');

const FEED_ROUTES = [
  '/api/integrations/v1/employees',
  '/api/integrations/v1/attendance',
  '/api/integrations/v1/attendance-events',
  '/employees',
  '/attendance',
  '/attendance-events',
];

const SCOPE_FEED_MAP = {
  'employees:read': '/employees',
  'attendance-daily:read': '/attendance',
  'attendance-events:read': '/attendance-events',
};

function normalizeFeedRoute(route) {
  if (!route) return route;
  if (route.endsWith('/attendance-events')) return '/attendance-events';
  if (route.endsWith('/attendance')) return '/attendance';
  if (route.endsWith('/employees')) return '/employees';
  return route;
}

/**
 * Pure function: evaluates sync health for an integration credential given its feed activity stats.
 *
 * Health status outcomes:
 * - 'revoked': Key has been revoked
 * - 'expired': Key has expired
 * - 'waiting': No feed synchronization activity recorded yet
 * - 'healthy': Recent 200 within 2x expectedPollMinutes
 * - 'delayed': 429 rate-limited, single 5xx glitch, or freshness between 2x and 3x expectedPollMinutes
 * - 'stale': Freshness exceeded 3x expectedPollMinutes without failure
 * - 'error': 401/403 auth failure, 2+ consecutive non-429 failures, or never-succeeded failures
 *
 * @param {Object} params
 * @param {Object} params.key
 * @param {Array<Object>} params.feedStats
 * @param {Date} [params.now]
 * @returns {Object} Evaluated health report
 */
function evaluateSyncHealth({ key, feedStats = [], now = new Date() }) {
  const pollInterval = key.expectedPollMinutes || 5;

  if (key.status === 'revoked') {
    return {
      keyId: key.keyId,
      name: key.name,
      overallStatus: 'revoked',
      expectedPollMinutes: pollInterval,
      feeds: [],
      reason: 'Key has been revoked.',
    };
  }

  if (key.expiresAt && now.getTime() >= new Date(key.expiresAt).getTime()) {
    return {
      keyId: key.keyId,
      name: key.name,
      overallStatus: 'expired',
      expectedPollMinutes: pollInterval,
      feeds: [],
      reason: 'Key has expired.',
    };
  }

  // Determine which feed routes this key is authorized to access
  const grantedScopes = Array.isArray(key.scopes) ? key.scopes : [];
  const relevantRoutes = Object.entries(SCOPE_FEED_MAP)
    .filter(([scope]) => grantedScopes.includes(scope))
    .map(([, route]) => route);

  if (relevantRoutes.length === 0) {
    return {
      keyId: key.keyId,
      name: key.name,
      overallStatus: 'waiting',
      expectedPollMinutes: pollInterval,
      feeds: [],
      reason: 'No readable feed scopes granted to this key.',
    };
  }

  const statMap = new Map();
  feedStats.forEach((stat) => {
    statMap.set(stat.route, stat);
  });

  const evaluatedFeeds = relevantRoutes.map((route) => {
    const stat = statMap.get(route);

    if (!stat || !stat.latestLog) {
      return {
        route,
        status: 'waiting',
        lastSuccessAt: null,
        lastFailedAt: null,
        latestStatusCode: null,
        consecutiveFailures: 0,
        freshnessMinutes: null,
        message: 'No poll activity recorded yet.',
      };
    }

    const latestStatusCode = stat.latestStatusCode || stat.latestLog.statusCode;
    const consecutiveFailures = stat.consecutiveFailures || 0;
    const lastSuccessAt = stat.lastSuccessAt ? new Date(stat.lastSuccessAt) : null;
    const lastFailedAt = stat.lastFailedAt ? new Date(stat.lastFailedAt) : null;
    const freshnessMinutes = lastSuccessAt ? (now.getTime() - lastSuccessAt.getTime()) / (60 * 1000) : null;

    let status = 'healthy';
    let message = 'Synchronization active and up to date.';

    // Rule 1: Immediate error on auth failure (401 / 403)
    if (latestStatusCode === 401 || latestStatusCode === 403) {
      status = 'error';
      message = `Authentication or authorization failed (${latestStatusCode}).`;
    }
    // Rule 2: Error on 2 or more consecutive failures (excluding 429)
    else if (consecutiveFailures >= 2) {
      status = 'error';
      message = `${consecutiveFailures} consecutive synchronization failures (last code: ${latestStatusCode}).`;
    }
    // Rule 3: Delayed on rate limit (429)
    else if (latestStatusCode === 429) {
      status = 'delayed';
      message = 'Poll was rate-limited by gateway throughput limiter (429).';
    }
    // Rule 4: Delayed on transient single 5xx error
    else if (latestStatusCode >= 500 && latestStatusCode < 600 && consecutiveFailures === 1) {
      status = 'delayed';
      message = `Transient server glitch encountered (${latestStatusCode}). Awaiting automatic retry.`;
    }
    // Rule 5: Error if never succeeded and has attempted
    else if (!lastSuccessAt) {
      status = 'error';
      message = `Synchronization attempted but has never succeeded (last code: ${latestStatusCode}).`;
    }
    // Rule 6: Stale if freshness > 3x expected poll interval
    else if (freshnessMinutes > 3 * pollInterval) {
      status = 'stale';
      message = `Sync delayed: last successful poll was ${Math.round(freshnessMinutes)}m ago (exceeds 3x poll interval of ${pollInterval}m).`;
    }
    // Rule 7: Delayed if freshness > 2x expected poll interval
    else if (freshnessMinutes > 2 * pollInterval) {
      status = 'delayed';
      message = `Sync pending: last successful poll was ${Math.round(freshnessMinutes)}m ago (exceeds 2x poll interval of ${pollInterval}m).`;
    }
    // Rule 8: Healthy
    else {
      status = 'healthy';
      message = `Healthy: synced ${Math.round(freshnessMinutes)}m ago.`;
    }

    return {
      route,
      status,
      lastSuccessAt,
      lastFailedAt,
      latestStatusCode,
      consecutiveFailures,
      freshnessMinutes: freshnessMinutes !== null ? Math.round(freshnessMinutes * 10) / 10 : null,
      message,
    };
  });

  // Severity order: error > stale > delayed > healthy > waiting
  let overallStatus = 'waiting';
  if (evaluatedFeeds.some((f) => f.status === 'error')) {
    overallStatus = 'error';
  } else if (evaluatedFeeds.some((f) => f.status === 'stale')) {
    overallStatus = 'stale';
  } else if (evaluatedFeeds.some((f) => f.status === 'delayed')) {
    overallStatus = 'delayed';
  } else if (evaluatedFeeds.length > 0 && evaluatedFeeds.every((f) => f.status === 'healthy')) {
    overallStatus = 'healthy';
  } else {
    overallStatus = 'waiting';
  }

  return {
    keyId: key.keyId,
    name: key.name,
    overallStatus,
    expectedPollMinutes: pollInterval,
    feeds: evaluatedFeeds,
  };
}

/**
 * Aggregates feed statistics for a list of keyIds from IntegrationRequestLog.
 * Uses bounded top-5 projection per route to avoid unbounded memory usage.
 *
 * @param {Array<string>} keyIds
 * @returns {Promise<Map<string, Array<Object>>>} Map of keyId -> Array of route stats
 */
async function getFeedStats(keyIds) {
  if (!Array.isArray(keyIds) || keyIds.length === 0) {
    return new Map();
  }

  const rawStats = await IntegrationRequestLog.aggregate([
    {
      $match: {
        keyId: { $in: keyIds },
        route: { $in: FEED_ROUTES },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { keyId: '$keyId', route: '$route' },
        latestLog: { $first: '$$ROOT' },
        lastSuccessAt: {
          $max: {
            $cond: [{ $and: [{ $gte: ['$status', 200] }, { $lt: ['$status', 300] }] }, '$createdAt', null],
          },
        },
        lastFailedAt: {
          $max: {
            $cond: [{ $gte: ['$status', 400] }, '$createdAt', null],
          },
        },
        recentLogs: { $push: { status: '$status', createdAt: '$createdAt' } },
      },
    },
    {
      $project: {
        latestLog: 1,
        lastSuccessAt: 1,
        lastFailedAt: 1,
        recentStatusCodes: { $slice: ['$recentLogs.status', 5] },
      },
    },
  ]);

  const map = new Map();
  keyIds.forEach((id) => map.set(id, []));

  rawStats.forEach((entry) => {
    const { keyId, route } = entry._id;
    const normalized = normalizeFeedRoute(route);
    const recentCodes = entry.recentStatusCodes || [];

    // Count consecutive failures (status >= 400 and != 429) starting from most recent
    let consecutiveFailures = 0;
    for (const code of recentCodes) {
      if (code >= 400 && code !== 429) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    const stat = {
      route: normalized,
      latestLog: entry.latestLog,
      latestStatusCode: entry.latestLog?.status || entry.latestLog?.statusCode || null,
      lastSuccessAt: entry.lastSuccessAt,
      lastFailedAt: entry.lastFailedAt,
      consecutiveFailures,
    };

    if (!map.has(keyId)) {
      map.set(keyId, []);
    }
    map.get(keyId).push(stat);
  });

  return map;
}

module.exports = {
  FEED_ROUTES,
  SCOPE_FEED_MAP,
  evaluateSyncHealth,
  getFeedStats,
};

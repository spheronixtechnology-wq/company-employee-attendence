const { evaluateSyncHealth } = require('../../src/services/syncHealth.service');

describe('syncHealth.service - evaluateSyncHealth (Unit)', () => {
  const baseKey = {
    keyId: 'test_key_01',
    name: 'Frappe HRMS Test Key',
    scopes: ['employees:read', 'attendance-daily:read', 'attendance-events:read'],
    employeeScope: 'all',
    expectedPollMinutes: 5,
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  const now = new Date('2026-10-27T10:00:00.000Z');

  it('1. Returns "waiting" when no feed activity logs exist', () => {
    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats: [],
      now,
    });

    expect(result.overallStatus).toBe('waiting');
    expect(result.feeds.length).toBe(3);
    result.feeds.forEach((feed) => {
      expect(feed.status).toBe('waiting');
      expect(feed.message).toContain('No poll activity');
    });
  });

  it('2. Returns "healthy" when all scoped feeds succeeded within 2x expectedPollMinutes', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 4 * 60 * 1000), // 4m ago (< 10m)
        consecutiveFailures: 0,
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 3 * 60 * 1000), // 3m ago (< 10m)
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 4 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('healthy');
    expect(result.feeds.every((f) => f.status === 'healthy')).toBe(true);
  });

  it('3. Returns "delayed" when freshness is between 2x and 3x expectedPollMinutes', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 12 * 60 * 1000), // 12m ago (between 10m and 15m)
        consecutiveFailures: 0,
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('delayed');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('delayed');
  });

  it('4. Returns "delayed" when latest response was 429 (rate-limited)', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 429 },
        latestStatusCode: 429,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('delayed');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('delayed');
    expect(empFeed.message).toContain('rate-limited');
  });

  it('5. Returns "delayed" on a single transient 5xx error', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 502 },
        latestStatusCode: 502,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 1, // Only 1 failure!
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('delayed');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('delayed');
    expect(empFeed.message).toContain('Transient');
  });

  it('6. Returns "stale" when freshness exceeds 3x expectedPollMinutes', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 25 * 60 * 1000), // 25m ago (> 15m)
        consecutiveFailures: 0,
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 3 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 3 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('stale');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('stale');
  });

  it('7. Returns "error" on 401 or 403 authorization failure immediately', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 401 },
        latestStatusCode: 401,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 1,
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('error');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('error');
    expect(empFeed.message).toContain('Authentication');
  });

  it('8. Returns "error" when 2 or more consecutive failures occur', () => {
    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 500 },
        latestStatusCode: 500,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 2, // 2 failures in a row
      },
      {
        route: '/attendance',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance-events',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
    ];

    const result = evaluateSyncHealth({
      key: baseKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('error');
    const empFeed = result.feeds.find((f) => f.route === '/employees');
    expect(empFeed.status).toBe('error');
    expect(empFeed.message).toContain('2 consecutive');
  });

  it('9. Evaluates key status: revoked and expired', () => {
    const revokedResult = evaluateSyncHealth({
      key: { ...baseKey, status: 'revoked' },
      feedStats: [],
      now,
    });
    expect(revokedResult.overallStatus).toBe('revoked');

    const expiredResult = evaluateSyncHealth({
      key: { ...baseKey, expiresAt: new Date(now.getTime() - 1000) },
      feedStats: [],
      now,
    });
    expect(expiredResult.overallStatus).toBe('expired');
  });

  it('10. Ignores feed routes that are not in key scopes', () => {
    const singleScopeKey = {
      ...baseKey,
      scopes: ['employees:read'], // Only employees!
    };

    const feedStats = [
      {
        route: '/employees',
        latestLog: { statusCode: 200 },
        latestStatusCode: 200,
        lastSuccessAt: new Date(now.getTime() - 2 * 60 * 1000),
        consecutiveFailures: 0,
      },
      {
        route: '/attendance', // Unscoped for this key, with 500 error
        latestLog: { statusCode: 500 },
        latestStatusCode: 500,
        lastSuccessAt: null,
        consecutiveFailures: 5,
      },
    ];

    const result = evaluateSyncHealth({
      key: singleScopeKey,
      feedStats,
      now,
    });

    expect(result.overallStatus).toBe('healthy');
    expect(result.feeds.length).toBe(1);
    expect(result.feeds[0].route).toBe('/employees');
  });
});

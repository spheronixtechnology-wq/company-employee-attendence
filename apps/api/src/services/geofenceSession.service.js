/**
 * geofenceSession.service.js
 *
 * Central authority for all geofence session logic.
 * The backend owns session state, alert level, and grace period.
 * Clients (web or Android) supply GPS readings and display what the backend returns.
 *
 * Key design principles:
 *  - Alert progression is TIME-BASED (elapsed since lastAlertAt), not ping-count-based.
 *  - One alert level advanced per processLocationUpdate call, regardless of elapsed intervals.
 *  - Alert progression uses atomic findOneAndUpdate (multi-tab concurrency guard).
 *  - GeofenceAlertEvent unique index is a secondary guard; err.code 11000 is caught explicitly.
 *  - BOUNDARY zone preserves any active alert session without resetting it.
 *  - INSIDE resolution requires insideConfirmationsRequired consecutive INSIDE readings.
 *  - Grace period timestamps (gracePeriodStartedAt / gracePeriodEndsAt) are stored in DB.
 *    Clients calculate remaining = gracePeriodEndsAt - now; never reset to a fixed duration.
 */

const crypto = require('crypto');
const GeofenceSession    = require('../models/GeofenceSession');
const GeofenceAlertEvent = require('../models/GeofenceAlertEvent');
const Attendance         = require('../models/Attendance');
const OfficeLocation     = require('../models/OfficeLocation');
const { isWithinGeofence } = require('../utils/haversine');

// ── Configuration ─────────────────────────────────────────────────────────────

const GEOFENCE_CONFIG = {
  /** Minimum seconds between consecutive alert escalations */
  alertIntervalSeconds: 60,

  /** Seconds from Alert 5 until auto-checkout fires */
  gracePeriodSeconds: 180,

  /** Consecutive INSIDE readings required before resolving a session */
  insideConfirmationsRequired: 3,

  /**
   * Hysteresis band around the configured radius.
   * outsideThreshold = radius + outsideBufferMeters → definitely OUTSIDE
   * insideThreshold  = radius - insideBufferMeters  → definitely INSIDE
   * Between the two thresholds               → BOUNDARY (no state change)
   */
  outsideBufferMeters: 15,
  insideBufferMeters:  10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a human-readable unique session ID.
 * Format: GEOFENCE_{employeeIdSuffix}_{YYYYMMDD}_{HHmmss}_{randomHex}
 */
function generateSessionId(employeeId) {
  const now     = new Date();
  const date    = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time    = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const suffix  = String(employeeId).slice(-6).toUpperCase();
  const rand    = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GEOFENCE_${suffix}_${date}_${time}_${rand}`;
}

/**
 * Determine the geographic zone given distance, configured radius, and hysteresis config.
 * Returns: "OUTSIDE" | "INSIDE" | "BOUNDARY"
 */
function determineZone(effectiveDistanceMeters, radiusMeters) {
  const outsideThreshold = radiusMeters + GEOFENCE_CONFIG.outsideBufferMeters;
  const insideThreshold  = radiusMeters - GEOFENCE_CONFIG.insideBufferMeters;

  if (effectiveDistanceMeters >= outsideThreshold) return 'OUTSIDE';
  if (effectiveDistanceMeters <= insideThreshold)  return 'INSIDE';
  return 'BOUNDARY';
}

// ── Core session helpers ──────────────────────────────────────────────────────

/**
 * Fetch the single ACTIVE session for this employee+attendance pair.
 * Returns null if none exists.
 */
async function getActiveSession(employeeId, attendanceId) {
  return GeofenceSession.findOne({ employeeId, attendanceId, status: 'ACTIVE' });
}

/**
 * Create a new ACTIVE session.
 * Immediately sets Alert 1 and writes the first GeofenceAlertEvent.
 */
async function createSession(employeeId, attendanceId, officeConfig, locationData) {
  const now       = new Date();
  const sessionId = generateSessionId(employeeId);

  const session = await GeofenceSession.create({
    employeeId,
    attendanceId,
    sessionId,
    status: 'ACTIVE',
    configuredLocation: {
      latitude:      officeConfig.latitude,
      longitude:     officeConfig.longitude,
      radiusMeters:  officeConfig.radiusMeters,
      officeName:    officeConfig.officeName   || null,
      configVersion: String(officeConfig._id)  || null,
    },
    latestLocation: {
      latitude:   locationData.lat,
      longitude:  locationData.lng,
      accuracy:   locationData.accuracy,
      distance:   locationData.distance,
      recordedAt: now,
    },
    alertState: {
      currentLevel: 1,
      alertsSent:   [1],
      lastAlertAt:  now,
    },
    outsideStartedAt:         now,
    insideConfirmationCount:  0,
    outsideConfirmationCount: 1,
    startedAt: now,
  });

  // Write Alert 1 audit event
  try {
    await GeofenceAlertEvent.create({
      sessionId,
      employeeId,
      attendanceId,
      alertLevel: 1,
      distance:   locationData.distance,
      accuracy:   locationData.accuracy,
      radius:     officeConfig.radiusMeters,
      sentAt:     now,
    });
  } catch (err) {
    if (err.code !== 11000) {
      console.error('[GeofenceSession] Alert 1 event write failed:', err.message);
    }
  }

  console.log(`[GeofenceSession] Created ${sessionId} for employee ${employeeId} — Alert 1`);
  return session;
}

/**
 * Update the latestLocation fields on a session document.
 * Used when no alert progression occurs (inside interval, boundary, etc.).
 */
async function updateLatestLocation(sessionId, locationData) {
  const now = new Date();
  await GeofenceSession.findOneAndUpdate(
    { sessionId, status: 'ACTIVE' },
    {
      $set: {
        'latestLocation.latitude':   locationData.lat,
        'latestLocation.longitude':  locationData.lng,
        'latestLocation.accuracy':   locationData.accuracy,
        'latestLocation.distance':   locationData.distance,
        'latestLocation.recordedAt': now,
      },
      $inc: { outsideConfirmationCount: 1 },
    }
  );
}

/**
 * Attempt to advance the session to the next alert level.
 *
 * Rules:
 *  - Only ONE level per call, regardless of how many intervals have elapsed.
 *    (If 120s passed since Alert 1, only Alert 2 fires; next call can fire Alert 3.)
 *  - If elapsed time since lastAlertAt < alertIntervalSeconds → no advance (just location update).
 *  - Uses atomic findOneAndUpdate with currentLevel condition to prevent multi-tab races.
 *  - The losing concurrent update returns the already-updated session without logging a duplicate event.
 *
 * Returns the updated (or current) session document.
 */
async function progressAlertIfDue(session, locationData) {
  const now       = new Date();
  const reference = session.alertState.lastAlertAt || session.outsideStartedAt || now;
  const elapsed   = (now - new Date(reference)) / 1000;

  // Not yet time for next alert — just update location
  if (elapsed < GEOFENCE_CONFIG.alertIntervalSeconds) {
    await updateLatestLocation(session.sessionId, locationData);
    return session;
  }

  // Already at maximum level — just update location
  if (session.alertState.currentLevel >= 5) {
    await updateLatestLocation(session.sessionId, locationData);
    return session;
  }

  const currentLevel = session.alertState.currentLevel;
  const nextLevel    = currentLevel + 1;
  const isAlert5     = nextLevel === 5;

  // ── Atomic conditional update ─────────────────────────────────────────────
  // Condition includes currentLevel so only one concurrent request wins.
  const updated = await GeofenceSession.findOneAndUpdate(
    {
      _id:    session._id,
      status: 'ACTIVE',
      'alertState.currentLevel': currentLevel, // concurrency guard
    },
    {
      $set: {
        'alertState.currentLevel': nextLevel,
        'alertState.lastAlertAt':  now,
        'latestLocation.latitude':   locationData.lat,
        'latestLocation.longitude':  locationData.lng,
        'latestLocation.accuracy':   locationData.accuracy,
        'latestLocation.distance':   locationData.distance,
        'latestLocation.recordedAt': now,
        // Grace period timestamps set only at Alert 5
        ...(isAlert5 ? {
          'alertState.gracePeriodStartedAt': now,
          'alertState.gracePeriodEndsAt': new Date(
            now.getTime() + GEOFENCE_CONFIG.gracePeriodSeconds * 1000
          ),
        } : {}),
      },
      $addToSet: { 'alertState.alertsSent': nextLevel },
      $inc: { outsideConfirmationCount: 1 },
    },
    { new: true }
  );

  if (!updated) {
    // Another tab/request won the race — the level was already advanced.
    // Fetch and return the fresh state; do NOT create a duplicate alert event.
    console.log(`[GeofenceSession] Alert ${nextLevel} race: another request already advanced ${session.sessionId}`);
    return GeofenceSession.findById(session._id);
  }

  // ── Log alert event (secondary uniqueness guard via unique index) ──────────
  try {
    await GeofenceAlertEvent.create({
      sessionId:    updated.sessionId,
      employeeId:   updated.employeeId,
      attendanceId: updated.attendanceId,
      alertLevel:   nextLevel,
      distance:     locationData.distance,
      accuracy:     locationData.accuracy,
      radius:       session.configuredLocation.radiusMeters,
      sentAt:       now,
    });
    console.log(`[GeofenceSession] ${updated.sessionId} → Alert ${nextLevel} (${Math.round(locationData.distance)}m / ${session.configuredLocation.radiusMeters}m)`);
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key: alert event already exists — expected under concurrency, safe to ignore
      console.warn(`[GeofenceSession] Alert event ${nextLevel} already logged for ${updated.sessionId}`);
    } else {
      // Unexpected error — state is already correct; log but don't throw
      console.error('[GeofenceSession] Alert event write failed:', err.message);
    }
  }

  return updated;
}

/**
 * Increment the insideConfirmationCount.
 * If the threshold is reached, resolve the session.
 * Returns { session, resolved: boolean }.
 */
async function addInsideConfirmation(session) {
  const newCount = (session.insideConfirmationCount || 0) + 1;

  if (newCount >= GEOFENCE_CONFIG.insideConfirmationsRequired) {
    // Resolve the session
    const resolved = await GeofenceSession.findByIdAndUpdate(
      session._id,
      {
        $set: {
          status:                  'RESOLVED',
          resolvedAt:              new Date(),
          insideConfirmationCount: newCount,
        },
      },
      { new: true }
    );
    console.log(`[GeofenceSession] ${session.sessionId} RESOLVED after ${newCount} inside confirmations`);
    return { session: resolved, resolved: true };
  }

  // Not yet enough confirmations
  const updated = await GeofenceSession.findByIdAndUpdate(
    session._id,
    { $set: { insideConfirmationCount: newCount } },
    { new: true }
  );
  return { session: updated, resolved: false };
}

/**
 * Reset insideConfirmationCount to 0 when an OUTSIDE reading is received
 * while a session is active (employee went back outside after partial return).
 */
async function resetInsideConfirmation(session) {
  if (session.insideConfirmationCount > 0) {
    await GeofenceSession.findByIdAndUpdate(
      session._id,
      { $set: { insideConfirmationCount: 0 } }
    );
  }
}

// ── Session terminal state helpers ────────────────────────────────────────────

/**
 * Mark session CANCELLED.
 * Called when attendance is closed by manual checkout or heartbeat auto-checkout
 * while the geofence session is still ACTIVE.
 */
async function cancelSession(employeeId, attendanceId) {
  const result = await GeofenceSession.findOneAndUpdate(
    { employeeId, attendanceId, status: 'ACTIVE' },
    { $set: { status: 'CANCELLED', resolvedAt: new Date() } },
    { new: true }
  );
  if (result) {
    console.log(`[GeofenceSession] ${result.sessionId} CANCELLED (attendance closed)`);
  }
  return result;
}

/**
 * Mark session AUTO_CHECKED_OUT.
 * Called after the geofence-triggered auto-checkout has been validated and executed.
 */
async function markAutoCheckedOut(sessionId) {
  const result = await GeofenceSession.findOneAndUpdate(
    { sessionId, status: 'ACTIVE' },
    { $set: { status: 'AUTO_CHECKED_OUT', resolvedAt: new Date() } },
    { new: true }
  );
  if (result) {
    console.log(`[GeofenceSession] ${sessionId} AUTO_CHECKED_OUT`);
  }
  return result;
}

// ── Auto-checkout validation ──────────────────────────────────────────────────

/**
 * Full revalidation before executing a geofence-triggered auto-checkout.
 * The backend is the authority — a stale frontend timer cannot cause an incorrect checkout.
 *
 * Returns { ok: true, session, attendance } or { ok: false, reason: string }.
 */
async function validateAutoCheckout(sessionId, attendanceId) {
  // 1. Session must exist and be ACTIVE
  const session = await GeofenceSession.findOne({ sessionId });
  if (!session)                              return { ok: false, reason: 'session_not_found' };
  if (session.status !== 'ACTIVE')           return { ok: false, reason: 'session_not_active' };
  if (session.alertState.currentLevel < 5)   return { ok: false, reason: 'level_not_5' };

  // 2. Grace period must have expired
  const now    = new Date();
  const endsAt = session.alertState.gracePeriodEndsAt;
  if (!endsAt || now < new Date(endsAt))     return { ok: false, reason: 'grace_not_expired' };

  // 3. Attendance must still be open
  const attendance = await Attendance.findById(session.attendanceId);
  if (!attendance)                           return { ok: false, reason: 'attendance_not_found' };
  if (attendance.checkOutTime)               return { ok: false, reason: 'already_checked_out' };

  // 4. AttendanceId must match (cross-session safety check)
  if (attendanceId && String(session.attendanceId) !== String(attendanceId)) {
    return { ok: false, reason: 'attendance_mismatch' };
  }

  return { ok: true, session, attendance };
}

// ── Session restore payload (GET endpoint) ────────────────────────────────────

/**
 * Build the payload for the GET /attendance/geofence/session endpoint.
 * Used by clients on page load / app start to restore alert state.
 */
async function getSessionRestorePayload(employeeId, attendanceId) {
  const session = await getActiveSession(employeeId, attendanceId);

  if (!session) {
    return { hasActiveSession: false };
  }

  const now     = new Date();
  const endsAt  = session.alertState.gracePeriodEndsAt
    ? new Date(session.alertState.gracePeriodEndsAt)
    : null;

  const gracePeriodRemainingSeconds = endsAt
    ? Math.max(0, Math.round((endsAt - now) / 1000))
    : null;

  const graceExpired = endsAt ? now >= endsAt : false;
  const activeOffice = await OfficeLocation.findOne({ status: 'active' }).lean();
  const dynamicRadius = activeOffice?.radiusMeters ?? session.configuredLocation?.radiusMeters ?? null;

  return {
    hasActiveSession: true,
    sessionId:        session.sessionId,
    status:           session.status,
    currentAlertLevel: session.alertState.currentLevel,
    alertsSent:        session.alertState.alertsSent,
    distance:  session.latestLocation?.distance  ?? null,
    radius:    dynamicRadius,
    officeRadius: dynamicRadius,
    officeName: activeOffice?.officeName ?? session.configuredLocation?.officeName ?? null,
    outsideStartedAt: session.outsideStartedAt,
    startedAt:        session.startedAt,

    // Grace period fields — only meaningful at Alert 5
    gracePeriodEndsAt:           endsAt ? endsAt.toISOString() : null,
    gracePeriodRemainingSeconds,
    graceExpired,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * processLocationUpdate
 *
 * Main state machine. Called on every presence ping.
 * Fetches the active OfficeLocation, calculates the GPS zone,
 * and transitions the geofence session accordingly.
 *
 * @param {Object} params
 * @param {ObjectId} params.employeeId
 * @param {ObjectId} params.attendanceId
 * @param {number}   params.lat         - GPS latitude from client
 * @param {number}   params.lng         - GPS longitude from client
 * @param {number}   params.accuracy    - GPS accuracy in meters from client
 *
 * @returns {Object} Response payload for the client
 */
async function processLocationUpdate({ employeeId, attendanceId, lat, lng, accuracy }) {
  // ── STEP 1: Load active office location ──────────────────────────────────
  const office = await OfficeLocation.findOne({ status: 'active' });

  if (!office || !office.latitude || !office.longitude) {
    return { geofenceStatus: 'UNCONFIGURED', currentAlertLevel: 0, isOutOfBounds: false };
  }

  // ── STEP 2: Calculate geofence (reuse existing accuracy-aware haversine) ─
  const geoResult = isWithinGeofence(
    lat,
    lng,
    office.latitude,
    office.longitude,
    office.radiusMeters ?? 100,
    accuracy ?? 0
  );

  if (geoResult.error) {
    // Invalid coordinates or accuracy — treat as LOCATION_UNAVAILABLE
    return {
      geofenceStatus: 'LOCATION_UNAVAILABLE',
      currentAlertLevel: 0,
      isOutOfBounds: false,
      error: geoResult.error,
    };
  }

  const rawDistance      = geoResult.distanceMeters;
  const effectiveDistance = geoResult.effectiveDistanceMeters;
  const zone             = determineZone(effectiveDistance, office.radiusMeters ?? 100);

  const locationData = {
    lat,
    lng,
    accuracy: accuracy ?? 0,
    distance: rawDistance,
  };

  // ── STEP 3: Fetch active session ─────────────────────────────────────────
  const session = await getActiveSession(employeeId, attendanceId);

  // ── STEP 4: State machine ─────────────────────────────────────────────────

  // ─ OUTSIDE ────────────────────────────────────────────────────────────────
  if (zone === 'OUTSIDE') {
    if (session) {
      // Reset any partial inside-confirmation progress
      await resetInsideConfirmation(session);

      // Attempt to advance alert level
      const updatedSession = await progressAlertIfDue(session, locationData);
      const level          = updatedSession.alertState.currentLevel;
      const endsAt         = updatedSession.alertState.gracePeriodEndsAt;
      const remaining      = endsAt
        ? Math.max(0, Math.round((new Date(endsAt) - new Date()) / 1000))
        : null;

      return {
        geofenceStatus:    'OUTSIDE',
        currentAlertLevel: level,
        sessionId:         updatedSession.sessionId,
        alertsSent:        updatedSession.alertState.alertsSent,
        distance:          rawDistance,
        radius:            office.radiusMeters,
        isOutOfBounds:     true,
        // Grace period info (relevant when level >= 5)
        gracePeriodEndsAt:           endsAt ? new Date(endsAt).toISOString() : null,
        gracePeriodRemainingSeconds: remaining,
        graceExpired:                remaining !== null && remaining <= 0,
      };
    }

    // No existing session — create a new one (Alert 1)
    try {
      const newSession = await createSession(employeeId, attendanceId, office, locationData);
      return {
        geofenceStatus:    'OUTSIDE',
        currentAlertLevel: 1,
        sessionId:         newSession.sessionId,
        alertsSent:        [1],
        distance:          rawDistance,
        radius:            office.radiusMeters,
        isOutOfBounds:     true,
        gracePeriodEndsAt:           null,
        gracePeriodRemainingSeconds: null,
        graceExpired:                false,
      };
    } catch (err) {
      if (err.code === 11000) {
        // Partial unique index violation: another concurrent request already created the session.
        // Fetch it and return its current state.
        const existingSession = await getActiveSession(employeeId, attendanceId);
        if (existingSession) {
          return {
            geofenceStatus:    'OUTSIDE',
            currentAlertLevel: existingSession.alertState.currentLevel,
            sessionId:         existingSession.sessionId,
            alertsSent:        existingSession.alertState.alertsSent,
            distance:          rawDistance,
            radius:            office.radiusMeters,
            isOutOfBounds:     true,
            gracePeriodEndsAt:           existingSession.alertState.gracePeriodEndsAt
              ? new Date(existingSession.alertState.gracePeriodEndsAt).toISOString()
              : null,
            gracePeriodRemainingSeconds: existingSession.alertState.gracePeriodEndsAt
              ? Math.max(0, Math.round((new Date(existingSession.alertState.gracePeriodEndsAt) - new Date()) / 1000))
              : null,
            graceExpired: false,
          };
        }
      }
      throw err;
    }
  }

  // ─ INSIDE ─────────────────────────────────────────────────────────────────
  if (zone === 'INSIDE') {
    if (!session) {
      // No active session — employee is simply inside, all good
      return {
        geofenceStatus:    'INSIDE',
        currentAlertLevel: 0,
        isOutOfBounds:     false,
        distance:          rawDistance,
        radius:            office.radiusMeters,
      };
    }

    // Active session exists — accumulate inside confirmations
    const { session: updatedSession, resolved } = await addInsideConfirmation(session);

    if (resolved) {
      return {
        geofenceStatus:         'INSIDE',
        currentAlertLevel:      0,
        sessionId:              updatedSession.sessionId,
        sessionResolved:        true,
        isOutOfBounds:          false,
        distance:               rawDistance,
        radius:                 office.radiusMeters,
        insideConfirmationCount: updatedSession.insideConfirmationCount,
      };
    }

    return {
      geofenceStatus:         'RETURNING',
      currentAlertLevel:      updatedSession.alertState.currentLevel,
      sessionId:              updatedSession.sessionId,
      sessionResolved:        false,
      isOutOfBounds:          true,
      distance:               rawDistance,
      radius:                 office.radiusMeters,
      insideConfirmationCount: updatedSession.insideConfirmationCount,
      insideConfirmationsRequired: GEOFENCE_CONFIG.insideConfirmationsRequired,
    };
  }

  // ─ BOUNDARY ───────────────────────────────────────────────────────────────
  // No session state change. If a session exists, its alert level is preserved.
  if (!session) {
    return {
      geofenceStatus:    'BOUNDARY',
      currentAlertLevel: 0,
      isOutOfBounds:     false,
      distance:          rawDistance,
      radius:            office.radiusMeters,
    };
  }

  // Update location only — do NOT reset insideConfirmationCount or advance alert
  await updateLatestLocation(session.sessionId, locationData);

  return {
    geofenceStatus:    'BOUNDARY',
    currentAlertLevel: session.alertState.currentLevel,
    sessionId:         session.sessionId,
    alertsSent:        session.alertState.alertsSent,
    isOutOfBounds:     session.alertState.currentLevel > 0,
    distance:          rawDistance,
    radius:            office.radiusMeters,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  processLocationUpdate,
  getSessionRestorePayload,
  validateAutoCheckout,
  cancelSession,
  markAutoCheckedOut,
  getActiveSession,
};

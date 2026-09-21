const mongoose = require('mongoose');

/**
 * GeofenceSession
 *
 * Represents one continuous out-of-geofence episode for an employee.
 * The backend owns all alert state — clients never calculate alert levels.
 *
 * Status lifecycle:
 *   ACTIVE          → employee is outside and session is being monitored
 *   RESOLVED        → employee returned inside (3 stable INSIDE confirmations)
 *   AUTO_CHECKED_OUT→ grace period expired; backend executed auto-checkout
 *   CANCELLED       → attendance was closed (manual/heartbeat checkout) while session was ACTIVE
 *
 * One ACTIVE session per (employeeId + attendanceId) enforced by partial unique index.
 */
const geofenceSessionSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      required: true,
      index: true,
    },

    /** Human-readable unique session identifier e.g. "GEOFENCE_EMP001_20260921_093000_8F31" */
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },

    /** ACTIVE | RESOLVED | AUTO_CHECKED_OUT | CANCELLED */
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'AUTO_CHECKED_OUT', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },

    /**
     * Snapshot of the geofence configuration at session creation time.
     * Immutable after creation — provides an audit record of which config triggered the session.
     */
    configuredLocation: {
      latitude:      { type: Number, required: true },
      longitude:     { type: Number, required: true },
      radiusMeters:  { type: Number, required: true },
      officeName:    { type: String, default: null },
      /** OfficeLocation._id as string — traces which config version was active */
      configVersion: { type: String, default: null },
    },

    /** Latest GPS reading received from the client */
    latestLocation: {
      latitude:   { type: Number, default: null },
      longitude:  { type: Number, default: null },
      accuracy:   { type: Number, default: null },
      distance:   { type: Number, default: null },
      recordedAt: { type: Date,   default: null },
    },

    /** Full alert progression state — owned entirely by the backend */
    alertState: {
      /** Current alert level (0 = no alert, 1–5 = escalating alerts) */
      currentLevel: { type: Number, default: 0, min: 0, max: 5 },

      /** Array of alert levels that have been emitted e.g. [1, 2, 3] */
      alertsSent: { type: [Number], default: [] },

      /** Timestamp of the most recent alert emission */
      lastAlertAt: { type: Date, default: null },

      /**
       * Grace period timestamps — set when Alert 5 fires.
       * Clients calculate remaining = gracePeriodEndsAt - now.
       * Never reset to a fixed duration on page refresh.
       */
      gracePeriodStartedAt: { type: Date, default: null },
      gracePeriodEndsAt:    { type: Date, default: null },
    },

    /** Timestamp when the employee first left the radius in this session */
    outsideStartedAt: { type: Date, default: null },

    /**
     * Consecutive valid INSIDE readings accumulated since the employee started returning.
     * Reset to 0 whenever an OUTSIDE reading is processed.
     * Session resolves when this reaches insideConfirmationsRequired (3).
     */
    insideConfirmationCount: { type: Number, default: 0, min: 0 },

    /** Consecutive OUTSIDE readings — diagnostic counter */
    outsideConfirmationCount: { type: Number, default: 0, min: 0 },

    /** When this session object was created (= first outside detection) */
    startedAt: { type: Date, default: Date.now },

    /** Set when status transitions to RESOLVED / AUTO_CHECKED_OUT / CANCELLED */
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

/** Fast lookup of active session for an employee */
geofenceSessionSchema.index({ employeeId: 1, status: 1 });

/** Lookup by attendance record */
geofenceSessionSchema.index({ attendanceId: 1, status: 1 });

/**
 * Partial unique index: enforces ONE ACTIVE session per employee+attendance.
 * MongoDB partial indexes only apply to documents matching the filter,
 * so RESOLVED / CANCELLED / AUTO_CHECKED_OUT sessions are not constrained.
 */
geofenceSessionSchema.index(
  { employeeId: 1, attendanceId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_active_session_per_attendance',
  }
);

module.exports = mongoose.model('GeofenceSession', geofenceSessionSchema);

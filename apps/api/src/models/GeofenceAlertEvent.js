const mongoose = require('mongoose');

/**
 * GeofenceAlertEvent
 *
 * Immutable audit record for every alert emitted within a GeofenceSession.
 * Records are NEVER deleted when a session resolves — they form the permanent
 * audit trail for manager/admin reporting.
 *
 * Unique index on { sessionId, alertLevel } is the secondary guard against
 * duplicate alert events under concurrent requests. The primary guard is the
 * atomic findOneAndUpdate on GeofenceSession.alertState.currentLevel.
 *
 * When inserting, catch err.code === 11000 and treat it as "already done".
 */
const geofenceAlertEventSchema = new mongoose.Schema(
  {
    /** References the parent GeofenceSession.sessionId (string, not ObjectId) */
    sessionId: {
      type: String,
      required: true,
      index: true,
    },

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
    },

    /** Alert level that was emitted: 1, 2, 3, 4, or 5 */
    alertLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    /** GPS distance from office at the time this alert was emitted (meters) */
    distance: {
      type: Number,
      default: null,
    },

    /** GPS accuracy reported by the client device (meters) */
    accuracy: {
      type: Number,
      default: null,
    },

    /** Configured geofence radius at the time of emission (meters) */
    radius: {
      type: Number,
      default: null,
    },

    /** When the alert was emitted */
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

/**
 * Primary uniqueness guarantee:
 * Only one alert event per (sessionId + alertLevel) pair.
 * Concurrent inserts: first wins; duplicates raise err.code === 11000.
 */
geofenceAlertEventSchema.index(
  { sessionId: 1, alertLevel: 1 },
  { unique: true, name: 'unique_alert_per_session_level' }
);

/** Lookup all alerts for an employee (reporting/audit) */
geofenceAlertEventSchema.index({ employeeId: 1, sentAt: -1 });

module.exports = mongoose.model('GeofenceAlertEvent', geofenceAlertEventSchema);

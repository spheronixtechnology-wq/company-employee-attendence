const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: String, required: true },
  checkInTime: { type: Date },
  checkOutTime: { type: Date },
  status: {
    type: String,
    enum: ['present', 'half_day', 'absent', 'leave', 'manual_pending', 'incomplete'],
    default: 'incomplete',
  },
  checkInMethod: {
    type: String,
    enum: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric', 'manual'],
    default: 'qr_code',
  },
  checkInIp: {
    type: String,
    default: null,
  },
  checkOutIp: {
    type: String,
    default: null,
  },
  checkInLocation: {
    lat: { type: Number, required: false },
    lng: { type: Number, required: false },
    accuracy: { type: Number, required: false },
    capturedAt: { type: Date, required: false },
  },
  checkOutLocation: {
    lat: { type: Number, required: false },
    lng: { type: Number, required: false },
    accuracy: { type: Number, required: false },
    capturedAt: { type: Date, required: false },
  },
  breaks: [
    {
      type: {
        type: String,
        enum: ['personal', 'meal', 'other', 'suspension'],
        default: 'personal'
      },
      startedAt: Date,
      endedAt: Date
    }
  ],
  completedBreakMinutes: {
    type: Number,
    default: 0
  },
  totalDurationMinutes: {
    type: Number,
    default: 0
  },
  totalBreakMinutes: {
    type: Number,
    default: 0
  },
  actualWorkMinutes: {
    type: Number,
    default: 0
  },
  dailyLogSubmitted: {
    type: Boolean,
    default: false
  },
  autoCheckedOut: {
    type: Boolean,
    default: false
  },
  autoCheckoutReason: {
    type: String,
    default: null
  },
  distanceFromOffice: { type: Number, default: null },
  geofenceRadius: { type: Number, default: null },
  geofenceStatus: { type: String, enum: ['VERIFIED', 'UNCERTAIN', 'OUTSIDE'], default: null },
  locationAccuracy: { type: Number, default: null },
  locationTimestamp: { type: Number, default: null },
  outOfBoundsReason: { type: String, default: null },
  lastHeartbeatAt: { type: Date, default: null },
  heartbeatStatus: {
    type: String,
    enum: ['NOT_MONITORED', 'GRACE_PERIOD', 'HEALTHY', 'WARNING', 'TIMED_OUT'],
    default: 'NOT_MONITORED',
  },
  heartbeatMonitoringGraceUntil: { type: Date, default: null },
  currentWarningCount: { type: Number, default: 0 },
  autoCheckoutAt: { type: Date, default: null },
  reactivationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', null],
    default: null
  },
  reactivationRequestedAt: { type: Date, default: null },
  reactivationDecisionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reactivationDecisionAt: { type: Date, default: null },
  reactivationDecisionNotes: { type: String, default: null },
  reactivatedAt: { type: Date, default: null },
  reactivationHistory: [
    {
      autoCheckoutAt: { type: Date },
      autoCheckoutReason: { type: String },
      employeeReason: { type: String },
      requestedAt: { type: Date },
      decision: { type: String, enum: ['approved', 'rejected'] },
      decisionBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      decisionAt: { type: Date },
      decisionNotes: { type: String },
      reactivatedAt: { type: Date },
    },
  ],
  attendanceMethodAttempts: [
    {
      method: {
        type: String,
        enum: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'],
      },
      status: {
        type: String,
        enum: ['failed', 'success'],
      },
      reason: { type: String, default: null },
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model('Attendance', attendanceSchema);


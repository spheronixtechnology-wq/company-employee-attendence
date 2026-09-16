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
        enum: ['personal', 'meal', 'other'],
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
  locationTimestamp: { type: Number, default: null }
});

module.exports = mongoose.model('Attendance', attendanceSchema);

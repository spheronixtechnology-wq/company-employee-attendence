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
    enum: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'],
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
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);

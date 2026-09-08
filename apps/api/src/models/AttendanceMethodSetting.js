const mongoose = require('mongoose');

/**
 * AttendanceMethodSetting — append-only history log.
 * Every switch creates a NEW document (never updated in place).
 * The latest document determines the currently active method.
 */
const attendanceMethodSettingSchema = new mongoose.Schema(
  {
    activeMethod: {
      type: String,
      enum: {
        values: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'],
        message: 'Invalid attendance method',
      },
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Reason is required when switching attendance method'],
      trim: true,
      maxlength: [300, 'Reason cannot exceed 300 characters'],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  }
);

// Index for fetching the latest/active method efficiently
attendanceMethodSettingSchema.index({ changedAt: -1 });

module.exports = mongoose.model('AttendanceMethodSetting', attendanceMethodSettingSchema);

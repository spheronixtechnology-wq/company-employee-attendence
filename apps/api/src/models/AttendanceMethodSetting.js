const mongoose = require('mongoose');

/**
 * AttendanceMethodSetting — Singleton Configuration.
 * Exactly one authoritative document holds the system's attendance method
 * and heartbeat monitoring configuration.
 * All historical modifications are recorded in the AuditLog collection.
 */
const attendanceMethodSettingSchema = new mongoose.Schema(
  {
    activeMethod: {
      type: String,
      enum: {
        values: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'],
        message: 'Invalid attendance method',
      },
      default: 'qr_code',
      required: true,
    },
    allowedMethods: {
      type: [String],
      enum: ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'],
      default: ['biometric', 'wifi_ip', 'qr_code'],
    },
    heartbeatMonitoringEnabled: {
      type: Boolean,
      default: false, // Default to FALSE: Heartbeat monitoring only runs if explicitly enabled by Manager
    },
    heartbeatTimeoutMinutes: {
      type: Number,
      default: 8,
      min: 1,
      max: 60,
    },
    heartbeatMonitoringStartedAt: {
      type: Date,
      default: null, // Set to timestamp when toggled ON; null when OFF
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Reason cannot exceed 300 characters'],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/**
 * Static helper: retrieves or safely initializes the single authoritative setting document.
 * Guarantees zero stale historical fallback issues.
 */
attendanceMethodSettingSchema.statics.getActiveSetting = async function () {
  let setting = await this.findOne();
  if (!setting) {
    setting = await this.create({
      activeMethod: 'qr_code',
      allowedMethods: ['biometric', 'wifi_ip', 'qr_code'],
      heartbeatMonitoringEnabled: false,
      heartbeatTimeoutMinutes: 8,
      heartbeatMonitoringStartedAt: null,
      reason: 'Initial system default configuration',
      changedAt: new Date(),
    });
  }
  return setting;
};

module.exports = mongoose.model('AttendanceMethodSetting', attendanceMethodSettingSchema);

const mongoose = require('mongoose');

const registeredDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['ACTIVE', 'REVOKED', 'EXPIRED'], default: 'ACTIVE' },
  isActive: { type: Boolean, default: true },
  temporaryUntil: { type: Date, default: null },
  revokedReason: { type: String, default: null },
  deviceLabel: { type: String, default: null },   // e.g. "Samsung Galaxy S21 · Chrome · Android 14"
  userAgent: { type: String, default: null },      // raw UA string for audit
  deviceFingerprint: { type: String, default: null },
  ipAddress: { type: String, default: null },
  lastSeenIp: { type: String, default: null },
  lastSeenAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('RegisteredDevice', registeredDeviceSchema);


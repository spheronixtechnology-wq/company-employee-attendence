const mongoose = require('mongoose');

const deviceRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestType: { type: String, enum: ['register', 'temporary', 'replacement', 'lost'], default: 'register' },
  reason: { type: String, default: '' },
  requestedDeviceLabel: { type: String, default: null },
  requestedUntil: { type: Date, default: null },
  decisionNote: { type: String, default: null },
  deviceFingerprint: { type: String, default: null },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('DeviceRequest', deviceRequestSchema);


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
  
  // State Machine pointers
  currentApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  currentApproverRole: { type: String, default: null },
  currentSequence: { type: Number, default: 0 },

  // The Frozen Snapshot
  approvalChain: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String },
    sequence: { type: Number }
  }],

  // Append-Only Audit Log
  approvalHistory: [{
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String },
    action: { type: String, enum: ['APPROVED', 'REJECTED'] },
    reason: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],

  submittedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('DeviceRequest', deviceRequestSchema);


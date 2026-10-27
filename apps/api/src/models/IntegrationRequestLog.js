const mongoose = require('mongoose');

const integrationRequestLogSchema = new mongoose.Schema(
  {
    keyId: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
    },
    route: {
      type: String,
      required: true,
    },
    status: {
      type: Number,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
    },
    requestId: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

// Automatic 90-day retention cleanup
integrationRequestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Compound index for ultra-fast sync-health queries per route
integrationRequestLogSchema.index({ keyId: 1, route: 1, createdAt: -1 });

module.exports = mongoose.model('IntegrationRequestLog', integrationRequestLogSchema);

const mongoose = require('mongoose');

const stepUpGrantSchema = new mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenVersion: {
      type: Number,
      required: true,
    },
    operation: {
      type: String,
      enum: [
        'integration_key:create',
        'integration_key:rotate',
        'integration_key:revoke',
        'integration_key:update_audience',
        'integration_key:update_scopes',
      ],
      required: true,
    },
    targetKeyId: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index for automatic background cleanup only (security logic uses atomic findOneAndUpdate check)
stepUpGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 300 });

module.exports = mongoose.model('StepUpGrant', stepUpGrantSchema);

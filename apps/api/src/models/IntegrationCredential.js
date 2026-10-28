const mongoose = require('mongoose');

const SCOPES_ENUM = [
  'employees:read',
  'employees:pii:read',
  'attendance-events:read',
  'attendance-daily:read',
  'attendance-audit:read',
  'attendance-history:read',
];

const integrationCredentialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Credential name is required'],
      trim: true,
      maxlength: [100, 'Credential name cannot exceed 100 characters'],
    },
    integration: {
      type: String,
      enum: ['frappe_hrms'],
      default: 'frappe_hrms',
      required: true,
    },
    environment: {
      type: String,
      enum: ['live', 'test'],
      required: [true, 'Environment is required (live or test)'],
    },
    keyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    keyPrefix: {
      type: String,
      required: true,
      trim: true,
    },
    secretHash: {
      type: String,
      required: true,
      select: false, // Never returned in normal queries
    },
    pepperVersion: {
      type: String,
      required: true,
      trim: true,
    },
    scopes: {
      type: [
        {
          type: String,
          enum: SCOPES_ENUM,
        },
      ],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one valid scope is required',
      },
    },
    employeeScope: {
      type: String,
      enum: ['all', 'restricted'],
      default: 'all',
      required: true,
    },
    allowedEmployees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    audienceVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    audienceChangedAt: {
      type: Date,
      default: Date.now,
    },
    expectedPollMinutes: {
      type: Number,
      default: 5,
      min: 1,
      max: 1440,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastFailedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    revokeReason: {
      type: String,
      enum: ['manual', 'rotated', 'compromised', 'rotation_aborted', null],
      default: null,
    },
    rotatedFromKeyId: {
      type: String,
      default: null,
    },
    rotatedToKeyId: {
      type: String,
      default: null,
    },
    rotationPendingKeyId: {
      type: String,
      default: null,
    },
    rotationLock: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active integration keys
integrationCredentialSchema.index({ integration: 1, status: 1 });

// Schema validation: expiresAt must be <= createdAt + 180 days (with a 5 minute skew margin)
integrationCredentialSchema.pre('validate', function (next) {
  if (this.expiresAt) {
    const baseTime = this.createdAt ? this.createdAt.getTime() : Date.now();
    const maxExpiry = baseTime + 180 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
    if (this.expiresAt.getTime() > maxExpiry) {
      return next(new Error('Expiration date cannot exceed 180 days from creation time.'));
    }
  }

  if (this.employeeScope === 'restricted') {
    if (!Array.isArray(this.allowedEmployees) || this.allowedEmployees.length === 0) {
      return next(new Error('Restricted integration key must specify at least one authorized employee.'));
    }
  }

  next();
});

// Helper to determine if key is expired
integrationCredentialSchema.virtual('isExpired').get(function () {
  return new Date() >= this.expiresAt;
});

module.exports = mongoose.model('IntegrationCredential', integrationCredentialSchema);
module.exports.SCOPES_ENUM = SCOPES_ENUM;

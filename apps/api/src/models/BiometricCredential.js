const mongoose = require('mongoose');

const biometricCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    registeredDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RegisteredDevice',
      required: true,
      index: true,
    },
    credentialID: {
      type: String,
      required: true,
      unique: true,
    },
    credentialPublicKey: {
      type: Buffer,
      required: true,
    },
    counter: {
      type: Number,
      required: true,
      default: 0,
    },
    rpID: {
      type: String,
      required: true,
    },
    expectedOrigin: {
      type: String,
      required: true,
    },
    transports: [{
      type: String,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BiometricCredential', biometricCredentialSchema);

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RegisteredDevice = require('../models/RegisteredDevice');
const BiometricCredential = require('../models/BiometricCredential');
const webauthnService = require('../services/webauthn.service');
const { success, badRequest } = require('../utils/response');

const getStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });

    if (!activeDevice) {
      return success(res, 'Status fetched', {
        isDeviceRegistered: false,
        isBiometricEnrolled: false,
        message: 'No active registered device found for this account.',
      });
    }

    const cred = await BiometricCredential.findOne({
      userId,
      registeredDeviceId: activeDevice._id,
      isActive: true,
    });

    const credentialCount = await BiometricCredential.countDocuments({
      userId,
      registeredDeviceId: activeDevice._id,
      isActive: true,
    });

    return success(res, 'Status fetched', {
      isDeviceRegistered: true,
      isBiometricEnrolled: !!cred,
      credentialCount,
      lastUsedAt: cred?.lastUsedAt || null,
      deviceLabel: activeDevice.deviceLabel,
    });
  } catch (err) {
    console.error('biometric.getStatus error:', err);
    return badRequest(res, 'Failed to fetch biometric status');
  }
};

const getEnrollOptions = async (req, res) => {
  try {
    const userId = req.user._id;
    const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });

    if (!activeDevice) {
      return badRequest(res, 'You must have an approved active device registered before enrolling biometrics.');
    }

    const options = await webauthnService.generateEnrollmentOptionsForUser(req.user, activeDevice, req);
    return success(res, 'Enrollment options generated', options);
  } catch (err) {
    console.error('biometric.getEnrollOptions error:', err);
    return badRequest(res, err.message || 'Failed to generate enrollment options');
  }
};

const verifyEnroll = async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) {
      return badRequest(res, 'Missing platform authenticator response');
    }

    const cred = await webauthnService.verifyEnrollmentResponseForUser(req.user, response, req);
    return success(res, 'Biometric enrolled successfully', {
      credentialId: cred.credentialID,
      lastUsedAt: cred.lastUsedAt,
    });
  } catch (err) {
    console.error('biometric.verifyEnroll error:', err);
    return badRequest(res, err.message || 'Biometric enrollment failed');
  }
};

const getAuthOptions = async (req, res) => {
  try {
    const userId = req.user._id;
    const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });

    if (!activeDevice) {
      return badRequest(res, 'No active registered device found for this account.');
    }

    const options = await webauthnService.generateAuthOptionsForUser(req.user, activeDevice._id, req);
    return success(res, 'Authentication options generated', options);
  } catch (err) {
    console.error('biometric.getAuthOptions error:', err);
    return badRequest(res, err.message || 'Failed to generate authentication options');
  }
};

const verifyAuth = async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) {
      return badRequest(res, 'Missing platform authenticator assertion response');
    }

    const userId = req.user._id;
    const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });

    if (!activeDevice) {
      return badRequest(res, 'No active registered device found for this account.');
    }

    const result = await webauthnService.verifyAuthResponseForUser(req.user, response, activeDevice._id, req);
    return success(res, 'Biometric authentication successful', result);
  } catch (err) {
    console.error('biometric.verifyAuth error:', err);
    return badRequest(res, err.message || 'Biometric authentication failed');
  }
};

const mobileVerify = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentFingerprint = req.headers['x-device-fingerprint'] || req.body.deviceFingerprint;
    const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });

    if (!activeDevice) {
      return badRequest(res, 'No active registered device found for this account.');
    }

    if (activeDevice.deviceFingerprint && currentFingerprint && activeDevice.deviceFingerprint !== currentFingerprint) {
      return badRequest(res, 'Device mismatch: Biometrics must be authenticated from your registered mobile device.');
    }

    // Generate short-lived single-use biometricToken (120 seconds)
    const jti = crypto.randomUUID();
    const expiresAtMs = Date.now() + 120 * 1000;

    const biometricToken = jwt.sign(
      {
        userId: userId.toString(),
        purpose: 'attendance_biometric',
        jti,
      },
      process.env.JWT_SECRET,
      { expiresIn: '120s' }
    );

    return success(res, 'Mobile biometric verified successfully', {
      biometricToken,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  } catch (err) {
    console.error('biometric.mobileVerify error:', err);
    return badRequest(res, err.message || 'Mobile biometric verification failed');
  }
};

module.exports = {
  getStatus,
  getEnrollOptions,
  verifyEnroll,
  getAuthOptions,
  verifyAuth,
  mobileVerify,
};

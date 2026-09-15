const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ManagerPermission = require('../models/ManagerPermission');
const RegisteredDevice = require('../models/RegisteredDevice');
const {
  generateBase32Secret,
  generateOtpauthUri,
  generateQrCodeDataUrl,
  verifyTotp,
} = require('../utils/mfaUtils');

/**
 * Generates a JWT token for a user, embedding tokenVersion for instant revocation.
 */
const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ id: userId, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const { getCookieOptions } = require('../config/cookie');

/**
 * Builds the user payload to return on login/me.
 * Includes manager permissions if role is manager.
 */
const buildUserPayload = async (user) => {
  const teamObj = user.teamId && typeof user.teamId === 'object' && user.teamId.name ? user.teamId : null;
  const payload = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    teamName: teamObj ? teamObj.name : null,
    isActive: user.isActive,
    phone: user.phone || null,
    designation: user.designation,
    avatarUrl: user.avatarUrl,
    mfaEnabled: !!user.mfaEnabled,
  };

  if (user.role === 'manager') {
    const mp = await ManagerPermission.findOne({ userId: user._id });
    payload.permissions = mp ? mp.permissions : {};
  }

  return payload;
};

/**
 * Login — validates credentials, checks mobile device binding for employees, and enforces MFA for managers.
 */
const login = async ({ email, password, deviceFingerprint, deviceLabel, isMobile, ipAddress, userAgent }) => {
  // Explicitly select passwordHash, mfaEnabled, and populate teamId
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash')
    .populate('teamId', 'name');

  if (!user) {
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: 'Your account has been deactivated. Contact admin.' };
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  // ── MANAGER MFA ENFORCEMENT ───────────────────────────────────────────────
  if (user.role === 'manager') {
    if (!user.mfaEnabled) {
      // First-time enrollment OR after Admin MFA reset:
      // Generate a fresh Base32 secret and QR code for Authenticator apps
      const secret = generateBase32Secret(32);
      const otpauthUri = generateOtpauthUri(user.email, secret, 'Spheronix');
      const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUri);

      // Save pending secret on user
      user.mfaPendingSecret = secret;
      user.mfaPendingCreatedAt = new Date();
      await user.save();

      // Sign a short-lived temporary token (10 minutes)
      const tempToken = jwt.sign(
        { userId: user._id.toString(), type: 'mfa_setup' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return {
        mfaRequired: true,
        mfaEnrolled: false,
        qrCode: qrCodeDataUrl,
        secret,
        tempToken,
      };
    } else {
      // Normal subsequent logins: MFA is already active.
      // Do NOT show QR code! Strictly prompt for 6-digit OTP.
      const tempToken = jwt.sign(
        { userId: user._id.toString(), type: 'mfa_verify' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return {
        mfaRequired: true,
        mfaEnrolled: true,
        tempToken,
      };
    }
  }

  // ── OPTION D: Device-Bound Login for Employees on Mobile Devices ───────────
  if (user.role === 'employee' && isMobile) {
    const registeredDevice = await RegisteredDevice.findOne({
      userId: user._id,
      isActive: true,
      status: 'ACTIVE',
    });

    if (!registeredDevice) {
      // Self-enroll first mobile device
      const newDevice = new RegisteredDevice({
        userId: user._id,
        status: 'ACTIVE',
        isActive: true,
        deviceFingerprint: deviceFingerprint || null,
        deviceLabel: deviceLabel || 'Registered Mobile Device',
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        lastSeenIp: ipAddress || null,
        lastSeenAt: new Date(),
      });
      await newDevice.save();
      console.log(`[Device Binding] Self-enrolled initial device for ${user.name}: ${deviceLabel || 'Mobile'}`);
    } else {
      // Existing active device found — check fingerprint binding
      if (!registeredDevice.deviceFingerprint) {
        // Rollout: enroll fingerprint if currently unset
        if (deviceFingerprint) {
          registeredDevice.deviceFingerprint = deviceFingerprint;
          if (deviceLabel) registeredDevice.deviceLabel = deviceLabel;
          registeredDevice.lastSeenIp = ipAddress || registeredDevice.lastSeenIp;
          registeredDevice.lastSeenAt = new Date();
          await registeredDevice.save();
        }
      } else if (!deviceFingerprint || deviceFingerprint !== registeredDevice.deviceFingerprint) {
        // Fingerprint mismatch — block login on unauthorized phone!
        const mismatchErr = new Error('This account is registered on another device.');
        mismatchErr.statusCode = 403;
        mismatchErr.data = {
          code: 'DEVICE_MISMATCH',
          registeredDeviceLabel: registeredDevice.deviceLabel || 'Your registered phone',
          currentDeviceLabel: deviceLabel || 'Unregistered device',
          canRequestAccess: true,
        };
        throw mismatchErr;
      } else {
        // Fingerprint matches! Update last seen
        registeredDevice.lastSeenIp = ipAddress || registeredDevice.lastSeenIp;
        registeredDevice.lastSeenAt = new Date();
        await registeredDevice.save();
      }
    }
  }

  const token = generateToken(user._id, user.tokenVersion || 0);
  const userPayload = await buildUserPayload(user);

  return { token, user: userPayload };
};

/**
 * Verifies initial MFA setup OTP.
 * Upon success: activates MFA, saves secret, clears pending secret, issues real JWT session.
 */
const setupVerifyMfa = async ({ tempToken, otp }) => {
  if (!tempToken || !otp) {
    throw { statusCode: 400, message: 'Temporary token and 6-digit OTP are required.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch (err) {
    throw { statusCode: 401, message: 'MFA setup session expired or invalid. Please sign in again.' };
  }

  if (decoded.type !== 'mfa_setup') {
    throw { statusCode: 400, message: 'Invalid MFA token type.' };
  }

  const user = await User.findById(decoded.userId)
    .select('+mfaPendingSecret +mfaSecret')
    .populate('teamId', 'name');

  if (!user || !user.isActive) {
    throw { statusCode: 401, message: 'User not found or deactivated.' };
  }

  if (!user.mfaPendingSecret) {
    throw { statusCode: 400, message: 'No pending MFA setup found. Please sign in again.' };
  }

  const isValid = verifyTotp(otp, user.mfaPendingSecret, 1);
  if (!isValid) {
    throw { statusCode: 400, message: 'Invalid 6-digit verification code. Please check your authenticator app and try again.' };
  }

  // Activate MFA!
  user.mfaSecret = user.mfaPendingSecret;
  user.mfaEnabled = true;
  user.mfaPendingSecret = null;
  user.mfaPendingCreatedAt = null;
  await user.save();

  const token = generateToken(user._id, user.tokenVersion || 0);
  const userPayload = await buildUserPayload(user);

  return { token, user: userPayload };
};

/**
 * Verifies subsequent login MFA OTP.
 * Upon success: issues real JWT session.
 */
const verifyMfa = async ({ tempToken, otp }) => {
  if (!tempToken || !otp) {
    throw { statusCode: 400, message: 'Temporary token and 6-digit OTP are required.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch (err) {
    throw { statusCode: 401, message: 'MFA verification session expired. Please sign in again.' };
  }

  if (decoded.type !== 'mfa_verify') {
    throw { statusCode: 400, message: 'Invalid MFA token type.' };
  }

  const user = await User.findById(decoded.userId)
    .select('+mfaSecret')
    .populate('teamId', 'name');

  if (!user || !user.isActive) {
    throw { statusCode: 401, message: 'User not found or deactivated.' };
  }

  if (!user.mfaEnabled || !user.mfaSecret) {
    throw { statusCode: 400, message: 'MFA is not configured for this account. Please contact admin or sign in again.' };
  }

  const isValid = verifyTotp(otp, user.mfaSecret, 1);
  if (!isValid) {
    throw { statusCode: 400, message: 'Invalid 6-digit OTP code. Please try again.' };
  }

  const token = generateToken(user._id, user.tokenVersion || 0);
  const userPayload = await buildUserPayload(user);

  return { token, user: userPayload };
};

/**
 * Get current logged-in user data (for /me endpoint).
 */
const getMe = async (userId) => {
  const user = await User.findById(userId).populate('teamId', 'name');
  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }
  return buildUserPayload(user);
};

module.exports = {
  login,
  setupVerifyMfa,
  verifyMfa,
  getMe,
  generateToken,
  getCookieOptions,
  buildUserPayload,
};

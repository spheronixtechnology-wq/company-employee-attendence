const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ManagerPermission = require('../models/ManagerPermission');
const RegisteredDevice = require('../models/RegisteredDevice');

/**
 * Generates a JWT token for a user, embedding tokenVersion for instant revocation.
 */
const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ id: userId, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Cookie options — HttpOnly, Secure in production.
 */
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  };
  if (isProd && process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN; // .spheronixtechnology.in
  }
  return options;
};

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
  };

  if (user.role === 'manager') {
    const mp = await ManagerPermission.findOne({ userId: user._id });
    payload.permissions = mp ? mp.permissions : {};
  }

  return payload;
};

/**
 * Login — validates credentials, checks mobile device binding for employees, and sets JWT cookie.
 */
const login = async ({ email, password, deviceFingerprint, deviceLabel, isMobile, ipAddress, userAgent }) => {
  // Explicitly select passwordHash since it's hidden by default, and populate teamId
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
 * Get current logged-in user data (for /me endpoint).
 */
const getMe = async (userId) => {
  const user = await User.findById(userId).populate('teamId', 'name');
  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }
  return buildUserPayload(user);
};

module.exports = { login, getMe, generateToken, getCookieOptions, buildUserPayload };

const authService = require('../services/auth.service');
const { getClearCookieOptions } = require('../config/cookie');
const User = require('../models/User');
const DeviceRequest = require('../models/DeviceRequest');
const Team = require('../models/Team');
const { createNotification } = require('../services/notification.service');
const { emitToManagers, emitToAdmins } = require('../socket');
const { success, error, badRequest } = require('../utils/response');

/**
 * POST /api/auth/login
 * Authenticates user, enforces mobile device binding for employees, and sets JWT httpOnly cookie.
 */
const login = async (req, res, next) => {
  try {
    const { email, password, deviceFingerprint, deviceLabel, isMobile } = req.body;

    if (!email || !password) {
      return badRequest(res, 'Email and password are required.');
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'] || '';

    // Robust server-side mobile detection (client flag, User-Agent, or Client Hints)
    const isMobileDevice = !!(
      isMobile ||
      req.headers['sec-ch-ua-mobile'] === '?1' ||
      /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
    );

    const result = await authService.login({
      email,
      password,
      deviceFingerprint: deviceFingerprint || req.headers['x-device-fingerprint'] || null,
      deviceLabel,
      isMobile: isMobileDevice,
      ipAddress: clientIp,
      userAgent,
    });

    // If MFA is required for this role (e.g. manager), return the MFA challenge payload
    if (result.mfaRequired) {
      return success(
        res,
        result.mfaEnrolled ? 'MFA authentication code required' : 'MFA enrollment required',
        result
      );
    }

    // Set JWT as httpOnly cookie with portal-specific name
    const portalRole = req.headers['x-portal-role'] || result.user?.role || 'employee';
    res.cookie(`token_${portalRole}`, result.token, authService.getCookieOptions());

    return success(res, 'Login successful', { user: result.user, token: result.token });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        data: err.data || null,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/device-access-request
 * Allows an employee to submit a device replacement / access request directly from the login screen.
 * Requires email + password verification so requests are legitimate.
 */
const requestDeviceAccess = async (req, res, next) => {
  try {
    const { email, password, reason, requestedDeviceLabel, deviceFingerprint } = req.body;

    if (!email || !password || !reason) {
      return badRequest(res, 'Email, password, and reason are required.');
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return error(res, 'Invalid credentials.', 401);
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return error(res, 'Invalid credentials.', 401);
    }
    if (!user.isActive) {
      return error(res, 'Your account has been deactivated. Contact admin.', 403);
    }

    // Check if there is already a pending request for this user
    const existing = await DeviceRequest.findOne({ userId: user._id, status: 'pending' });
    if (existing) {
      return success(res, 'A device request is already pending approval from your manager or admin.', {
        request: existing,
        alreadyPending: true,
      });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'] || '';

    const newRequest = new DeviceRequest({
      userId: user._id,
      requestType: 'replacement',
      status: 'pending',
      reason: reason.trim(),
      requestedDeviceLabel: requestedDeviceLabel || 'Unknown Mobile Device',
      deviceFingerprint: deviceFingerprint || null,
      ipAddress: clientIp,
      userAgent,
    });
    await newRequest.save();

    // Create manager notification
    try {
      if (user.teamId) {
        const team = await Team.findById(user.teamId);
        if (team?.leadUserId) {
          await createNotification({
            userId: team.leadUserId,
            type: 'device_request_submitted',
            title: 'New Device Replacement Request',
            message: `${user.name} requested device replacement for ${requestedDeviceLabel || 'new device'}: "${reason}"`,
            relatedId: newRequest._id,
          });
        }
      }
      // Also notify admins
      const admins = await User.find({ role: 'admin', isActive: true }, '_id');
      for (const adm of admins) {
        await createNotification({
          userId: adm._id,
          type: 'device_request_submitted',
          title: 'New Device Replacement Request',
          message: `${user.name} requested device replacement for ${requestedDeviceLabel || 'new device'}: "${reason}"`,
          relatedId: newRequest._id,
        });
      }
    } catch (notifErr) {
      console.warn('Failed to dispatch manager/admin notification:', notifErr.message);
    }

    // Real-time socket emission to managers & admins
    try {
      emitToManagers('device:request_created', {
        requestId: newRequest._id,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        deviceLabel: requestedDeviceLabel,
        reason,
      });
      emitToAdmins('device:request_created', {
        requestId: newRequest._id,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        deviceLabel: requestedDeviceLabel,
        reason,
      });
    } catch (sockErr) {
      console.warn('Socket emission failed:', sockErr.message);
    }

    return success(res, 'Device access request submitted successfully. Awaiting approval.', {
      request: newRequest,
      userId: user._id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Clears the JWT cookie.
 */
const logout = (req, res) => {
  const portalRole = req.headers['x-portal-role'] || 'employee';
  res.clearCookie(`token_${portalRole}`, getClearCookieOptions());
  return success(res, 'Logged out successfully');
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and permissions.
 */
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user._id);
    return success(res, 'User profile retrieved', { user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/mfa/setup-verify
 * Manager verifies 6-digit OTP from Authenticator app to complete initial enrollment or re-enrollment.
 */
const mfaSetupVerify = async (req, res, next) => {
  try {
    const { tempToken, otp } = req.body;
    const { token, user } = await authService.setupVerifyMfa({ tempToken, otp });

    const portalRole = req.headers['x-portal-role'] || user.role || 'manager';
    res.cookie(`token_${portalRole}`, token, authService.getCookieOptions());

    return success(res, 'MFA setup verified and activated successfully', { user });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

/**
 * POST /api/auth/mfa/verify
 * Manager verifies 6-digit OTP from Authenticator app on subsequent logins.
 */
const mfaVerify = async (req, res, next) => {
  try {
    const { tempToken, otp } = req.body;
    const { token, user } = await authService.verifyMfa({ tempToken, otp });

    const portalRole = req.headers['x-portal-role'] || user.role || 'manager';
    res.cookie(`token_${portalRole}`, token, authService.getCookieOptions());

    return success(res, 'MFA verified successfully', { user, token });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return badRequest(res, 'Password must be at least 6 characters long.');
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return badRequest(res, 'User not found.');

    user.passwordHash = newPassword;
    user.forcePasswordChange = false;
    await user.save();

    return success(res, 'Password changed successfully', { user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  logout,
  getMe,
  requestDeviceAccess,
  mfaSetupVerify,
  mfaVerify,
  changePassword,
};

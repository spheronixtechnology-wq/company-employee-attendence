const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ManagerPermission = require('../models/ManagerPermission');

/**
 * Generates a JWT token for a user.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
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
  const payload = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    isActive: user.isActive,
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
 * Login — validates credentials and sets JWT cookie.
 */
const login = async ({ email, password }) => {
  // Explicitly select passwordHash since it's hidden by default
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

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

  const token = generateToken(user._id);
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

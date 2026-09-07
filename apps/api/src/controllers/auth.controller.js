const authService = require('../services/auth.service');
const { success, error, badRequest } = require('../utils/response');

/**
 * POST /api/auth/login
 * Authenticates user and sets JWT httpOnly cookie.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return badRequest(res, 'Email and password are required.');
    }

    const { token, user } = await authService.login({ email, password });

    // Set JWT as httpOnly cookie with portal-specific name
    const portalRole = req.headers['x-portal-role'] || 'employee';
    res.cookie(`token_${portalRole}`, token, authService.getCookieOptions());

    return success(res, 'Login successful', { user });
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Clears the JWT cookie.
 */
const logout = (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const clearOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
  };
  if (isProd && process.env.COOKIE_DOMAIN) {
    clearOptions.domain = process.env.COOKIE_DOMAIN;
  }
  const portalRole = req.headers['x-portal-role'] || 'employee';
  res.clearCookie(`token_${portalRole}`, clearOptions);
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

module.exports = { login, logout, getMe };

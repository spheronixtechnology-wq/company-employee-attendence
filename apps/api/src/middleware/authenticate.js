const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Team = require('../models/Team'); // Added to register the schema before populating
const { unauthorized } = require('../utils/response');
/**
 * authenticate middleware
 * Verifies the JWT from the httpOnly cookie and attaches req.user.
 * Must be used before any route that requires authentication.
 */
const authenticate = async (req, res, next) => {
  try {
    const portalRole = req.headers['x-portal-role'] || 'employee';
    const cookieName = `token_${portalRole}`;
    const token = req.cookies?.[cookieName];

    if (!token) {
      return unauthorized(res, 'Authentication required. Please log in.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return unauthorized(res, 'Session expired. Please log in again.');
      }
      return unauthorized(res, 'Invalid session token. Please log in.');
    }

    const user = await User.findById(decoded.id).populate('teamId', 'name leadUserId');

    if (!user) {
      return unauthorized(res, 'User account not found.');
    }

    if (!user.isActive) {
      return unauthorized(res, 'Your account has been deactivated. Contact admin.');
    }

    // Immediate session revocation check (e.g. when new device approved)
    const userVersion = user.tokenVersion || 0;
    const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : 0;
    if (tokenVersion !== userVersion) {
      return unauthorized(res, 'Session terminated. This device was replaced or access was revoked. Please log in again.');
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[authenticate] Unexpected error:', err);
    return unauthorized(res, 'Authentication failed.');
  }
};

module.exports = authenticate;

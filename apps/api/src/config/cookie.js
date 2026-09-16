/**
 * Spheronix Attendance System — Centralized Cookie Configuration
 * Manages httpOnly cookie options for session tokens across login and logout.
 * 
 * Rules:
 * 1. Host-only cookies on localhost / development (domain is omitted).
 * 2. In production, domain is set to COOKIE_DOMAIN (e.g. .spheronixtechnology.in)
 *    only if NODE_ENV === 'production' and COOKIE_DOMAIN is defined.
 * 3. getClearCookieOptions() mirrors getCookieOptions() attributes (path, domain, secure, sameSite)
 *    to ensure browsers reliably delete the cookie on logout.
 */

/**
 * Returns options for setting authentication JWT cookies.
 * @param {Object} [overrides={}] Optional overrides for cookie settings
 * @returns {import('express').CookieOptions}
 */
const getCookieOptions = (overrides = {}) => {
  const isProd = process.env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
    ...overrides,
  };

  // Only assign domain in production when an explicit domain is defined
  if (isProd && process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  return options;
};

/**
 * Returns options for clearing authentication JWT cookies upon logout.
 * Must match domain, path, and secure flags of the original cookie.
 * @param {Object} [overrides={}] Optional overrides
 * @returns {import('express').CookieOptions}
 */
const getClearCookieOptions = (overrides = {}) => {
  const isProd = process.env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    ...overrides,
  };

  if (isProd && process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  return options;
};

module.exports = {
  getCookieOptions,
  getClearCookieOptions,
};

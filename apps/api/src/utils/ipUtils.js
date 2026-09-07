/**
 * Utility helpers for client IP address extraction.
 */

/**
 * Extracts the real client IP address from an Express request object.
 * Handles reverse proxies (Nginx / Cloudflare) using 'x-forwarded-for',
 * strips IPv6 transition prefixes (::ffff:), and normalizes localhost.
 * 
 * @param {import('express').Request} req
 * @returns {string} Clean IP address string
 */
const getClientIp = (req) => {
  if (!req) return 'Unknown IP';

  let ip = null;

  // Check x-forwarded-for header (first address is the client when trust proxy is set)
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    ip = list.split(',')[0].trim();
  }

  // Fallbacks: req.ip (populated by Express if trust proxy is on), then socket
  if (!ip) {
    ip = req.ip || (req.socket ? req.socket.remoteAddress : null) || 'Unknown IP';
  }

  // Clean IPv6 transition prefix ::ffff:192.168.1.1 -> 192.168.1.1
  if (typeof ip === 'string') {
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }
    // Normalize IPv6 localhost
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
  }

  return ip || 'Unknown IP';
};

module.exports = {
  getClientIp,
};

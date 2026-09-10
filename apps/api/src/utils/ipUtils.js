/**
 * Utility helpers for client IP address extraction, validation, and CIDR subnet evaluation.
 */
const ipaddr = require('ipaddr.js');

/**
 * Extracts the real client IP address securely from an Express request object.
 * Express computes req.ip based on the configured 'trust proxy' setting, which
 * validates the trusted reverse proxy chain (Nginx/Cloudflare) and discards
 * untrusted client-injected headers.
 *
 * @param {import('express').Request} req
 * @returns {string} Clean IP address string
 */
const getClientIp = (req) => {
  if (!req) return 'Unknown IP';

  // Check Cloudflare header first (for Cloudflare Tunnel or Cloudflare CDN proxy)
  let ip = req.headers ? (req.headers['cf-connecting-ip'] || req.headers['x-real-ip']) : null;

  // Primary: Express computed req.ip via trust proxy
  if (!ip) {
    ip = req.ip;
  }

  // Fallback: direct socket address if req.ip is not populated
  if (!ip) {
    ip = (req.socket ? req.socket.remoteAddress : null) || 'Unknown IP';
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

/**
 * Checks whether clientIp matches any exact IP or CIDR block in allowedIps.
 * Supports IPv4, IPv6, IPv4-mapped IPv6, and CIDR ranges.
 *
 * @param {string} clientIp - The detected client IP
 * @param {string[]} allowedIps - List of allowed IPs or CIDR notations
 * @returns {boolean} True if matching, false otherwise
 */
const isIpInAllowedList = (clientIp, allowedIps) => {
  if (!clientIp || !Array.isArray(allowedIps) || allowedIps.length === 0) {
    return false;
  }

  let parsedClient;
  try {
    let cleanClient = clientIp.trim();
    if (cleanClient.startsWith('::ffff:')) {
      cleanClient = cleanClient.replace('::ffff:', '');
    }
    parsedClient = ipaddr.parse(cleanClient);
    if (parsedClient.kind() === 'ipv6' && parsedClient.isIPv4MappedAddress()) {
      parsedClient = parsedClient.toIPv4Address();
    }
  } catch (err) {
    return false;
  }

  for (const entry of allowedIps) {
    if (!entry || typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    try {
      if (trimmed.includes('/')) {
        // CIDR notation (e.g. 103.5.135.64/28 or 2001:db8::/32)
        const cidr = ipaddr.parseCIDR(trimmed);
        if (parsedClient.kind() === cidr[0].kind()) {
          if (parsedClient.match(cidr)) {
            return true;
          }
        }
      } else {
        // Exact IP match
        let cleanAllowed = trimmed;
        if (cleanAllowed.startsWith('::ffff:')) {
          cleanAllowed = cleanAllowed.replace('::ffff:', '');
        }
        const parsedAllowed = ipaddr.parse(cleanAllowed);
        let normalizedAllowed = parsedAllowed;
        if (parsedAllowed.kind() === 'ipv6' && parsedAllowed.isIPv4MappedAddress()) {
          normalizedAllowed = parsedAllowed.toIPv4Address();
        }

        if (parsedClient.kind() === normalizedAllowed.kind()) {
          if (parsedClient.toString() === normalizedAllowed.toString()) {
            return true;
          }
        }
      }
    } catch (err) {
      // Ignore malformed IP entry in allowed list
      continue;
    }
  }

  return false;
};

/**
 * Masks an IP address for privacy-preserving display in client UI.
 * e.g. 103.5.135.77 -> 103.5.135.xxx
 *
 * @param {string} ip
 * @returns {string} Masked IP string
 */
const maskIp = (ip) => {
  if (!ip || typeof ip !== 'string') return 'Unknown';
  const clean = ip.replace('::ffff:', '').trim();
  if (clean === '127.0.0.1' || clean === 'localhost') return '127.0.0.1 (Localhost)';

  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  } else if (clean.includes(':')) {
    const parts = clean.split(':');
    return `${parts.slice(0, 3).join(':')}:xxxx:xxxx`;
  }
  return clean;
};

const os = require('os');

/**
 * Discovers active physical network interfaces on the host machine.
 * Filters out internal loopback, VirtualBox, WSL, and pseudo adapters.
 * Returns array of { adapterName, ip, netmask, subnet }
 */
const getActiveLocalInterfaces = () => {
  const nets = os.networkInterfaces();
  const results = [];
  for (const [name, addrs] of Object.entries(nets)) {
    const lower = name.toLowerCase();
    if (
      lower.includes('virtual') ||
      lower.includes('pseudo') ||
      lower.includes('loopback') ||
      lower.includes('wsl') ||
      lower.includes('vethernet') ||
      name.startsWith('vbox')
    ) {
      continue;
    }
    for (const net of addrs) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('192.168.56.')) {
        let subnet = null;
        try {
          const parsed = ipaddr.IPv4.parse(net.address);
          const mask = ipaddr.IPv4.parse(net.netmask);
          let prefix = 0;
          for (const b of mask.octets) {
            prefix += (b.toString(2).match(/1/g) || []).length;
          }
          const netOctets = parsed.octets.map((octet, i) => octet & mask.octets[i]);
          subnet = netOctets.join('.') + '/' + prefix;
        } catch (e) {}
        results.push({
          adapterName: name,
          ip: net.address,
          netmask: net.netmask,
          subnet: subnet || `${net.address}/24`,
        });
      }
    }
  }
  return results;
};

module.exports = {
  getClientIp,
  isIpInAllowedList,
  maskIp,
  getActiveLocalInterfaces,
};


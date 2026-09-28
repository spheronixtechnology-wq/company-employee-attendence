const { getClientIp, isIpInAllowedList, maskIp } = require('../../src/utils/ipUtils');

describe('IP Utilities', () => {
  describe('getClientIp()', () => {
    it('should extract IP from Cloudflare header (cf-connecting-ip)', () => {
      const req = {
        headers: { 'cf-connecting-ip': '203.0.113.5' },
        ip: '127.0.0.1',
      };
      expect(getClientIp(req)).toBe('203.0.113.5');
    });

    it('should fallback to req.ip if no proxy headers exist', () => {
      const req = {
        headers: {},
        ip: '198.51.100.10',
      };
      expect(getClientIp(req)).toBe('198.51.100.10');
    });

    it('should clean IPv6 transition prefixes', () => {
      const req = {
        headers: {},
        ip: '::ffff:192.168.1.100',
      };
      expect(getClientIp(req)).toBe('192.168.1.100');
    });
  });

  describe('isIpInAllowedList()', () => {
    it('should correctly match exact IPv4 addresses', () => {
      const allowed = ['192.168.1.10', '10.0.0.5'];
      expect(isIpInAllowedList('192.168.1.10', allowed)).toBe(true);
      expect(isIpInAllowedList('192.168.1.11', allowed)).toBe(false);
    });

    it('should correctly match IPs against a CIDR block', () => {
      // 192.168.1.0/24 allows 192.168.1.0 to 192.168.1.255
      const allowed = ['192.168.1.0/24'];
      expect(isIpInAllowedList('192.168.1.55', allowed)).toBe(true);
      expect(isIpInAllowedList('192.168.1.254', allowed)).toBe(true);
      expect(isIpInAllowedList('192.168.2.1', allowed)).toBe(false);
    });

    it('should reject malformed IPs safely without crashing', () => {
      const allowed = ['192.168.1.0/24'];
      expect(isIpInAllowedList('not-an-ip', allowed)).toBe(false);
    });
  });

  describe('maskIp()', () => {
    it('should mask the last octet of an IPv4 address', () => {
      expect(maskIp('192.168.1.50')).toBe('192.168.1.xxx');
    });

    it('should label localhost explicitly', () => {
      expect(maskIp('127.0.0.1')).toBe('127.0.0.1 (Localhost)');
      expect(maskIp('::1')).toBe('127.0.0.1 (Localhost)'); // Handled in getClientIp usually, but if passed directly...
    });
  });
});

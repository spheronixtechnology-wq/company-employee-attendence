const KEY_REGEX = /^shk_(live|test)_([0-9a-f]{16})_([0-9a-f]{64})$/;

describe('Integration Key Format & Regex Parsing (Unit)', () => {
  it('should accept valid live and test keys', () => {
    const validLive = 'shk_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const validTest = 'shk_test_fedcba9876543210_fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

    expect(KEY_REGEX.test(validLive)).toBe(true);
    expect(KEY_REGEX.test(validTest)).toBe(true);

    const matchLive = validLive.match(KEY_REGEX);
    expect(matchLive[1]).toBe('live');
    expect(matchLive[2]).toBe('0123456789abcdef');
    expect(matchLive[3]).toHaveLength(64);
  });

  it('should reject invalid prefixes', () => {
    const invalidPrefixes = [
      'mock_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'api_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'shk_prod_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'shk_stage_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ];

    invalidPrefixes.forEach((k) => {
      expect(KEY_REGEX.test(k)).toBe(false);
    });
  });

  it('should reject uppercase hex characters', () => {
    const uppercaseKeyId = 'shk_live_0123456789ABCDEF_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const uppercaseSecret = 'shk_live_0123456789abcdef_0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(KEY_REGEX.test(uppercaseKeyId)).toBe(false);
    expect(KEY_REGEX.test(uppercaseSecret)).toBe(false);
  });

  it('should reject malformed lengths', () => {
    // 15 hex keyId (1 short)
    const shortKeyId = 'shk_live_0123456789abcde_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    // 63 hex secret (1 short)
    const shortSecret = 'shk_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde';

    expect(KEY_REGEX.test(shortKeyId)).toBe(false);
    expect(KEY_REGEX.test(shortSecret)).toBe(false);
  });

  it('should reject keys with spaces, special characters, or extra delimiters', () => {
    expect(KEY_REGEX.test(' shk_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(false);
    expect(KEY_REGEX.test('shk_live_0123456789abcdef_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef ')).toBe(false);
    expect(KEY_REGEX.test('shk_live_0123456789abcdef_0123456789abcdef_0123456789abcdef')).toBe(false);
    expect(KEY_REGEX.test('')).toBe(false);
  });
});

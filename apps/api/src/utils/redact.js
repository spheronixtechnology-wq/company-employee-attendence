/**
 * Redaction utility for sanitizing sensitive data (secrets, keys, tokens, passwords)
 * from logs, error reports, and console outputs.
 */

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'secret',
  'secretHash',
  'rawKey',
  'token',
  'otp',
  'mfaSecret',
  'mfaPendingSecret',
  'cookie',
  'authorization',
];

/**
 * Recursively deep-clones an object and masks sensitive fields.
 * @param {any} data
 * @returns {any} Sanitized clone
 */
function redactSensitive(data) {
  if (!data || typeof data !== 'object') {
    if (typeof data === 'string' && data.startsWith('shk_')) {
      const parts = data.split('_');
      if (parts.length >= 4) {
        return `shk_${parts[1]}_${parts[2]}_[REDACTED]`;
      }
      return '[REDACTED_API_KEY]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((s) => lowerKey.includes(s.toLowerCase()));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = redactSensitive(value);
    } else if (typeof value === 'string' && value.startsWith('shk_')) {
      sanitized[key] = redactSensitive(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

module.exports = {
  redactSensitive,
};

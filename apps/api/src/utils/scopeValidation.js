const { SCOPES_ENUM } = require('../models/IntegrationCredential');

/**
 * Validates an integration key scope list: non-empty, unique, every entry supported.
 * @param {unknown} scopes
 * @returns {{ valid: true, scopes: string[] } | { valid: false, code: string, message: string }}
 */
const validateScopesInput = (scopes) => {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { valid: false, code: 'INVALID_SCOPES', message: 'scopes must be a non-empty array.' };
  }
  if (new Set(scopes).size !== scopes.length) {
    return { valid: false, code: 'INVALID_SCOPES', message: 'scopes must not contain duplicates.' };
  }
  const unknown = scopes.filter((s) => !SCOPES_ENUM.includes(s));
  if (unknown.length > 0) {
    return { valid: false, code: 'INVALID_SCOPES', message: `Unsupported scopes: ${unknown.join(', ')}.` };
  }
  return { valid: true, scopes };
};

module.exports = { validateScopesInput };

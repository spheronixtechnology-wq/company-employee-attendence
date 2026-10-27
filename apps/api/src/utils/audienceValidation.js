const mongoose = require('mongoose');
const User = require('../models/User');

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Validates audience configuration for integration credentials.
 * Ensures:
 * 1. employeeScope is strictly 'all' or 'restricted'
 * 2. If restricted, allowedEmployees is a non-empty array of valid 24-hex ObjectIds
 * 3. Every employee exists, is active (isActive === true), and not soft-deleted (deletedAt === null)
 *
 * @param {Object} params
 * @param {string} params.employeeScope
 * @param {Array<string|mongoose.Types.ObjectId>} params.allowedEmployees
 * @returns {Promise<{ valid: boolean, code?: string, message?: string, details?: any, sanitizedIds?: string[] }>}
 */
async function validateAudienceInput({ employeeScope, allowedEmployees }) {
  if (!employeeScope || !['all', 'restricted'].includes(employeeScope)) {
    return {
      valid: false,
      code: 'INVALID_EMPLOYEE_SCOPE',
      message: 'employeeScope must be either "all" or "restricted".',
    };
  }

  if (employeeScope === 'all') {
    return {
      valid: true,
      sanitizedIds: [],
    };
  }

  // employeeScope === 'restricted'
  if (!Array.isArray(allowedEmployees) || allowedEmployees.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_ALLOWED_EMPLOYEES',
      message: 'Restricted integration key must specify at least one authorized employee ID.',
    };
  }

  const hasInvalidFormat = allowedEmployees.some(
    (id) => !id || (typeof id !== 'string' && typeof id !== 'object') || !HEX_24_REGEX.test(String(id))
  );

  if (hasInvalidFormat) {
    return {
      valid: false,
      code: 'INVALID_EMPLOYEE_FORMAT',
      message: 'Invalid employee ID format in allowedEmployees. Must be valid 24-character hexadecimal IDs.',
    };
  }

  const uniqueIds = [...new Set(allowedEmployees.map((id) => String(id)))];

  // Authoritative check against User collection: must be active and not soft-deleted
  const activeUsers = await User.find({
    _id: { $in: uniqueIds },
    isActive: true,
    deletedAt: null,
  }).select('_id');

  if (activeUsers.length !== uniqueIds.length) {
    const foundSet = new Set(activeUsers.map((u) => u._id.toString()));
    const invalidIds = uniqueIds.filter((id) => !foundSet.has(id));

    return {
      valid: false,
      code: 'INVALID_EMPLOYEE_IDS',
      message: 'One or more selected employees do not exist, are inactive, or are soft-deleted.',
      details: { invalidIds },
    };
  }

  return {
    valid: true,
    sanitizedIds: uniqueIds,
  };
}

module.exports = {
  validateAudienceInput,
};

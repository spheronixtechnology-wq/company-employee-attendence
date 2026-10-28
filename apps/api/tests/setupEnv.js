/**
 * Jest Global Environment Setup
 * Defines necessary mock environment variables so validateEnv() and services
 * can initialize cleanly during automated test execution.
 */

// Load existing .env if available
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '5001';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_1234567890abcdef';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test_cookie_secret_1234567890abcdef';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_test';

// Peppers for Frappe HRMS Integration Keys
process.env.INTEGRATION_KEY_PEPPERS = process.env.INTEGRATION_KEY_PEPPERS || 'v1:mock_test_pepper_1234567890abcdef,v2:mock_test_pepper_second_version_abcdef';
process.env.INTEGRATION_KEY_PEPPER_CURRENT = process.env.INTEGRATION_KEY_PEPPER_CURRENT || 'v1';

// Additional secrets for existing utilities
process.env.OFFICE_QR_SECRET = process.env.OFFICE_QR_SECRET || 'mock_qr_secret_1234567890abcdef';

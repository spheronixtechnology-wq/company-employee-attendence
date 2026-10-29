const crypto = require('crypto');

const validateEnv = () => {
  const requiredEnv = [
    'MONGODB_URI',
    'JWT_SECRET',
  ];

  requiredEnv.forEach((envVar) => {
    if (!process.env[envVar]) {
      console.error(`Error: Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  });

  // Frappe HRMS Integration Keys - Provide graceful fallback with warning if not set
  if (!process.env.INTEGRATION_KEY_PEPPER_CURRENT) {
    process.env.INTEGRATION_KEY_PEPPER_CURRENT = 'v1';
  }

  if (!process.env.INTEGRATION_KEY_PEPPERS) {
    const fallbackPepper = crypto
      .createHash('sha256')
      .update(`${process.env.JWT_SECRET || 'spheronix_secret'}_integration_pepper_seed`)
      .digest('hex');
    process.env.INTEGRATION_KEY_PEPPERS = `v1:${fallbackPepper}`;
    console.warn(
      '⚠️ [WARN] INTEGRATION_KEY_PEPPERS is not set. Generated fallback pepper from JWT_SECRET to prevent server startup crash. Please configure INTEGRATION_KEY_PEPPERS in Render / environment settings.'
    );
  }
};

module.exports = validateEnv;

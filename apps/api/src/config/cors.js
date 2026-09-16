/**
 * Spheronix Attendance System — Centralized CORS Configuration
 * Single source of truth for allowed frontend origins across Express and Socket.io.
 */

/**
 * Builds the list of allowed frontend origins from environment variables.
 * Prioritizes explicit portal variables, with fallback to default production and local URLs.
 * Also incorporates legacy CORS_ORIGINS if provided for backward compatibility.
 *
 * @returns {string[]} Array of allowed origin URLs
 */
const getAllowedOrigins = () => {
  const origins = [
    // Production frontends
    process.env.FRONTEND_ADMIN_URL || 'https://admin.spheronixtechnology.in',
    process.env.FRONTEND_MANAGER_URL || 'https://manager.spheronixtechnology.in',
    process.env.FRONTEND_EMPLOYEE_URL || 'https://employee.spheronixtechnology.in',

    // Local development frontends
    process.env.FRONTEND_ADMIN_LOCAL_URL || 'http://localhost:3000',
    process.env.FRONTEND_MANAGER_LOCAL_URL || 'http://localhost:3001',
    process.env.FRONTEND_EMPLOYEE_LOCAL_URL || 'http://localhost:3002',
    'https://localhost:3002', // Local HTTPS for Employee WebAuthn / FIDO2 testing
  ];

  // Merge legacy or additional custom origins from CORS_ORIGINS
  if (process.env.CORS_ORIGINS) {
    const extraOrigins = process.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    origins.push(...extraOrigins);
  }

  // Deduplicate and filter empty strings
  return Array.from(new Set(origins.filter(Boolean)));
};

/**
 * Shared CORS options applied to both Express and Socket.io.
 */
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Allow non-browser requests (mobile apps, Postman, curl, server-to-server)
    // In development mode, allow all origins to easily support mobile / network testing
    
    // Original logic:
    // if (!origin || allowed.includes(origin) || process.env.NODE_ENV === 'development') {
    
    // Automatically accept the 'www.' version if the base domain is allowed
    const normalizedOrigin = origin ? origin.replace(/^https?:\/\/www\./, 'https://') : origin;
    
    if (!origin || allowed.includes(origin) || allowed.includes(normalizedOrigin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed.`));
    }
  },
  credentials: true, // Required for httpOnly JWT cookies to be sent cross-origin / cross-subdomain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-device-fingerprint',
    'x-portal-role',
    'x-device-token',
  ],
};

module.exports = {
  getAllowedOrigins,
  corsOptions,
};

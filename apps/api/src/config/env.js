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
};

module.exports = validateEnv;

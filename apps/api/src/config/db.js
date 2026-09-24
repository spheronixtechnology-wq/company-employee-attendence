const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 120000,
      readPreference: 'primary',
    });

    isConnected = true;
    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

// Graceful shutdown for App termination (Ctrl+C)
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed (app terminated).');
  process.exit(0);
});

// Graceful shutdown for Nodemon restarts
process.on('SIGUSR2', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed (nodemon restart).');
  process.kill(process.pid, 'SIGUSR2');
});

module.exports = connectDB;

require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Clear all biometric credentials to reset WebAuthn state
    const db = mongoose.connection.db;
    const result = await db.collection('biometriccredentials').deleteMany({});
    console.log(`Deleted ${result.deletedCount} old biometric credentials.`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();

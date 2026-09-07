require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@spheronixtechnology.in';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234';
    
    // Unconditionally update or create the admin user
    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = new User({
        email: adminEmail,
        name: process.env.SEED_ADMIN_NAME || 'Super Admin',
        role: 'admin',
      });
    }
    
    // Set the password and save so the pre('save') hook runs and hashes it
    adminUser.passwordHash = adminPassword;
    adminUser.isActive = true;
    
    await adminUser.save();
    
    console.log(`Successfully reset admin user password: ${adminEmail}`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin:', err);
    process.exit(1);
  }
};

seedAdmin();

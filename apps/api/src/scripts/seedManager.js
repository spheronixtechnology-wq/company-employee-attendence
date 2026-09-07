require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seedManager = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const managerEmail = 'manager@spheronixtechnology.in';
    const managerPassword = 'Manager@1234';
    
    let managerUser = await User.findOne({ email: managerEmail });
    if (!managerUser) {
      managerUser = new User({
        email: managerEmail,
        name: 'Test Manager',
        role: 'manager',
      });
    }
    
    // Set password and activate
    managerUser.passwordHash = managerPassword;
    managerUser.isActive = true;
    
    await managerUser.save();
    
    console.log(`\n✅ Manager credentials created/reset successfully!`);
    console.log(`Email: ${managerEmail}`);
    console.log(`Password: ${managerPassword}\n`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding manager:', err);
    process.exit(1);
  }
};

seedManager();

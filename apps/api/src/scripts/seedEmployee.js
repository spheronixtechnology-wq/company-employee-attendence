require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seedEmployee = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const employeeEmail = 'employee@spheronixtechnology.in';
    const employeePassword = 'Employee@1234';
    
    let employeeUser = await User.findOne({ email: employeeEmail });
    if (!employeeUser) {
      employeeUser = new User({
        email: employeeEmail,
        name: 'Test Employee',
        role: 'employee',
      });
    }
    
    // Set password and activate
    employeeUser.passwordHash = employeePassword;
    employeeUser.isActive = true;
    
    await employeeUser.save();
    
    console.log(`\n✅ Employee credentials created/reset successfully!`);
    console.log(`Email: ${employeeEmail}`);
    console.log(`Password: ${employeePassword}\n`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding employee:', err);
    process.exit(1);
  }
};

seedEmployee();

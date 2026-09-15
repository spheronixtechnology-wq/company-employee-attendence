require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const testUsers = [
  { name: 'Test Employee 1', email: 'employee1@spheronixtechnology.in', password: 'Employee@123', role: 'employee', department: 'Engineering' },
  { name: 'Test Employee 2', email: 'employee2@spheronixtechnology.in', password: 'Employee@123', role: 'employee', department: 'Design' },
  { name: 'Test Employee 3', email: 'employee3@spheronixtechnology.in', password: 'Employee@123', role: 'employee', department: 'Marketing' },
  { name: 'Test Employee 4', email: 'employee4@spheronixtechnology.in', password: 'Employee@123', role: 'employee', department: 'Sales' },
  { name: 'Test Employee 5', email: 'employee5@spheronixtechnology.in', password: 'Employee@123', role: 'employee', department: 'HR' }
];

const seedTestUsers = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    for (const data of testUsers) {
      let user = await User.findOne({ email: data.email });
      if (!user) {
        user = new User({
          name: data.name,
          email: data.email,
          role: data.role,
          department: data.department
        });
      }
      user.passwordHash = data.password;
      user.isActive = true;
      await user.save();
      console.log(`Saved user: ${data.email}`);
    }

    console.log('Finished seeding 5 test users.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding test users:', err);
    process.exit(1);
  }
};

seedTestUsers();

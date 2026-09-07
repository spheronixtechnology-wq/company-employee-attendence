// Fix: Assign all unassigned employees to Test Team
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const User = require('../models/User');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const TEST_TEAM_ID = '6a9e48fc4b157d241d3eac0e';
  
  const result = await User.updateMany(
    { role: 'employee', teamId: null },
    { $set: { teamId: TEST_TEAM_ID } }
  );
  console.log('Fixed:', result.modifiedCount, 'employees assigned to Test Team');
  
  const users = await User.find({ teamId: TEST_TEAM_ID }, 'name email role teamId');
  console.log('Test Team members now:');
  users.forEach(u => console.log(' -', u.name, '(' + u.role + ')'));
  
  await mongoose.disconnect();
  console.log('Done.');
}

fix().catch(console.error);

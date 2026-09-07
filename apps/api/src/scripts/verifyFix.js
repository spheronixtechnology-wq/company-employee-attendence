const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const User = require('../models/User');
const DeviceRequest = require('../models/DeviceRequest');

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  const TEST_TEAM_ID = '6a9e48fc4b157d241d3eac0e';
  
  const members = await User.find({ teamId: TEST_TEAM_ID, role: 'employee' }, 'name');
  const memberIds = members.map(m => m._id);
  console.log('Team employees (visible to manager):', members.map(m => m.name));
  
  const pending = await DeviceRequest.find({ userId: { $in: memberIds }, status: 'pending' }).populate('userId', 'name');
  console.log('Pending device requests:', pending.length);
  pending.forEach(r => console.log(' -', r.userId?.name, '|', r.status, '|', r.requestType));
  
  await mongoose.disconnect();
  console.log('Done.');
}
verify().catch(console.error);

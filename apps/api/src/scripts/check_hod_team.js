require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/attendance-system');
  const teams = await Team.find({});
  for (const team of teams) {
    const teamMembers = await User.find({
      $or: [
        { teamId: team._id, role: { $in: ['employee', 'faculty', 'hod'] } },
        { _id: team.leadUserId }
      ],
      isActive: true
    }).lean();
    console.log('Team', team.name, 'members:', teamMembers.map(m => m.role));
  }
  mongoose.disconnect();
}
check();

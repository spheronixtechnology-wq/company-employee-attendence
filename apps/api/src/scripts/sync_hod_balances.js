require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const { initializeLeaveBalances } = require('../services/leave.service');

async function sync() {
  await mongoose.connect(process.env.MONGODB_URI);
  const currentYear = new Date().getFullYear();
  const leaveTypes = await LeaveType.find({ isActive: true });
  const teams = await Team.find({});
  
  for (const team of teams) {
    if (team.leadUserId) {
      await initializeLeaveBalances(team.leadUserId);
      const bulkOps = leaveTypes.map(lt => {
        const quota = team.leaveQuotas ? team.leaveQuotas[lt.code] : null;
        if (quota == null) return null;
        return {
          updateOne: {
            filter: { userId: team.leadUserId, leaveTypeId: lt._id, year: currentYear },
            update: { $set: { allocated: quota } }
          }
        };
      }).filter(op => op !== null);
      if (bulkOps.length > 0) {
        await LeaveBalance.bulkWrite(bulkOps);
      }
      console.log('Synced HOD:', team.leadUserId, 'for team:', team.name);
    }
  }
  mongoose.disconnect();
}
sync();

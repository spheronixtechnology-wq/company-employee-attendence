require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const Team = require('../models/Team');
const User = require('../models/User');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const { initializeLeaveBalances } = require('../services/leave.service');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const quotas = { SL: 18, CL: 19, EL: 4, UL: 0 };
  const teams = await Team.find({});
  const leaveTypes = await LeaveType.find({ isActive: true });
  const currentYear = new Date().getFullYear();
  
  for (const team of teams) {
    team.leaveQuotas = quotas;
    await team.save();
    
    const orConditions = [{ teamId: team._id, role: { $in: ['employee', 'faculty', 'hod'] } }];
    if (team.leadUserId) orConditions.push({ _id: team.leadUserId });
    
    const teamMembers = await User.find({ $or: orConditions, isActive: true }).lean();
    for (const member of teamMembers) {
      await initializeLeaveBalances(member._id);
      const bulkOps = leaveTypes.map(lt => {
        const q = quotas[lt.code];
        if (q == null) return null;
        return {
          updateOne: {
            filter: { userId: member._id, leaveTypeId: lt._id, year: currentYear },
            update: { $set: { allocated: q } }
          }
        };
      }).filter(Boolean);
      if (bulkOps.length > 0) await LeaveBalance.bulkWrite(bulkOps);
    }
  }
  console.log('Fixed all teams and members to', quotas);
  mongoose.disconnect();
}
fix();

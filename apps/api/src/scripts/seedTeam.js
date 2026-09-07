require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const DeviceRequest = require('../models/DeviceRequest');
const DailyLog = require('../models/DailyLog');
const LeaveType = require('../models/LeaveType');
const { getTodayDateString } = require('../utils/dateUtils');

const seedTeam = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const manager = await User.findOne({ email: 'manager@spheronixtechnology.in' });
    const employee = await User.findOne({ email: 'employee@spheronixtechnology.in' });

    if (!manager || !employee) {
      console.log('Test manager or employee not found. Run seedManager and seedEmployee first.');
      process.exit(1);
    }

    // 1. Create or update Team
    let team = await Team.findOne({ name: 'Test Team' });
    if (!team) {
      team = new Team({ name: 'Test Team', description: 'Development Team' });
    }
    team.leadUserId = manager._id;
    await team.save();
    console.log(`Team created: ${team.name} (Lead: ${manager.name})`);

    // 2. Link employee and manager to team
    employee.teamId = team._id;
    await employee.save();
    manager.teamId = team._id;
    await manager.save();
    console.log(`Assigned ${employee.name} and ${manager.name} to ${team.name}`);

    // 3. Seed data for dashboard
    const today = getTodayDateString();

    // Check if attendance exists
    const att = await Attendance.findOne({ userId: employee._id, date: today });
    if (!att) {
      await Attendance.create({
        userId: employee._id,
        date: today,
        checkInTime: new Date(new Date().setHours(9, 0, 0, 0)), // 9:00 AM
        status: 'present'
      });
      console.log('Created sample Attendance for today');
    }

    // Check if LeaveRequest exists
    const lr = await LeaveRequest.findOne({ userId: employee._id, status: 'pending' });
    if (!lr) {
      const lt = await LeaveType.findOne({ isActive: true });
      if (lt) {
        await LeaveRequest.create({
          userId: employee._id,
          teamId: team._id,
          leaveTypeId: lt._id,
          startDate: today,
          endDate: today,
          totalDays: 1,
          reason: 'Medical appointment',
          status: 'pending'
        });
        console.log('Created pending LeaveRequest');
      }
    }

    // Check if DeviceRequest exists
    const dr = await DeviceRequest.findOne({ userId: employee._id, status: 'pending' });
    if (!dr) {
      await DeviceRequest.create({
        userId: employee._id,
        status: 'pending',
        requestType: 'temporary',
        requestedDeviceLabel: 'iPhone 15 Pro',
        reason: 'Main phone under repair'
      });
      console.log('Created pending DeviceRequest');
    }

    // Check if DailyLog exists
    const dl = await DailyLog.findOne({ userId: employee._id, logDate: today });
    if (!dl) {
      await DailyLog.create({
        userId: employee._id,
        teamId: team._id,
        logDate: today,
        taskTitle: 'API Development',
        projectName: 'Attendance System',
        hoursSpent: 4,
        description: 'Worked on manager APIs'
      });
      console.log('Created sample DailyLog');
    }

    console.log('\n✅ Team and sample data seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding team:', err);
    process.exit(1);
  }
};

seedTeam();

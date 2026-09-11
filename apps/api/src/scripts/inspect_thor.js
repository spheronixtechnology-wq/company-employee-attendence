const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
require('dotenv').config({ path: '.env' });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const thor = await User.findOne({ name: { $regex: 'thor', $options: 'i' } });
  console.log('Thor:', thor?.name, thor?._id);
  if (thor) {
    const att = await Attendance.findOne({ userId: thor._id, date: '2026-09-11' });
    console.log('Thor Attendance:', {
      checkIn: att?.checkInTime,
      checkOut: att?.checkOutTime,
      totalDuration: att?.totalDurationMinutes,
      totalBreaks: att?.totalBreakMinutes,
      actualWork: att?.actualWorkMinutes,
      completedBreakMinutes: att?.completedBreakMinutes
    });
    const log = await DailyLog.findOne({ userId: thor._id, logDate: '2026-09-11' });
    console.log('Thor DailyLog:', {
      hoursSpent: log?.hoursSpent,
      taskTitle: log?.taskTitle,
      createdAt: log?.createdAt,
      updatedAt: log?.updatedAt,
    });
  }
  process.exit();
})();

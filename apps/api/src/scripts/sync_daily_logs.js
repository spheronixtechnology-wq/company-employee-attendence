const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
require('dotenv').config({ path: '.env' });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const attendances = await Attendance.find({
    checkOutTime: { $exists: true, $ne: null },
    actualWorkMinutes: { $gt: 0 }
  });
  console.log('Found completed attendances:', attendances.length);
  for (const att of attendances) {
    const computedHours = Math.round((att.actualWorkMinutes / 60) * 10) / 10;
    const updated = await DailyLog.updateMany(
      { userId: att.userId, logDate: att.date },
      { $set: { hoursSpent: computedHours } }
    );
    if (updated.modifiedCount > 0) {
      console.log(`Synced daily log for user ${att.userId} on ${att.date} to ${computedHours}h (${att.actualWorkMinutes} mins)`);
    }
  }
  process.exit();
})();

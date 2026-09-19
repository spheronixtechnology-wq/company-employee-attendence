const mongoose = require('mongoose');
require('dotenv').config({ path: 'e:/Employee Dashboard/attendance-system/apps/api/.env' });

require('../models/User');
const User = mongoose.model('User');
const Attendance = require('../models/Attendance');
const sessionReactivationService = require('../services/sessionReactivation.service');

async function bulkReactivateAll() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ No admin user found');
      process.exit(1);
    }
    console.log(`👤 Using Admin reviewer: ${admin.name} (${admin.email})`);

    const today = '2026-09-19';
    const records = await Attendance.find({
      date: today,
      checkInTime: { $ne: null },
      $or: [
        { checkOutTime: { $ne: null } },
        { autoCheckedOut: true },
        { status: 'incomplete' }
      ]
    }).populate('userId');

    console.log(`📋 Found ${records.length} closed/suspended attendance records for today (${today})`);

    let reactivatedCount = 0;
    for (const record of records) {
      const email = record.userId?.email || 'unknown';
      console.log(`\n🔄 Reactivating: ${record.userId?.name} (${email})...`);
      
      const res = await sessionReactivationService.approveSessionReactivation({
        attendanceId: record._id,
        reviewerUser: admin,
        notes: 'Bulk reactivation requested by Admin before 6:00 PM cutoff',
        ipAddress: '127.0.0.1'
      });

      if (res.success) {
        reactivatedCount++;
        console.log(`   ✅ Success! Status: ${res.attendance.status}, checkOutTime: ${res.attendance.checkOutTime}, reactivatedAt: ${res.attendance.reactivatedAt}`);
      } else {
        console.log(`   ❌ Failed: ${res.message}`);
      }
    }

    console.log(`\n========================================`);
    console.log(`🎉 Successfully reactivated ${reactivatedCount} / ${records.length} accounts!`);
    console.log(`========================================\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error executing bulk reactivation:', err);
    process.exit(1);
  }
}

bulkReactivateAll();

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const migrateEmployeeIds = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const users = await User.find({ employeeId: { $in: [null, undefined, ''] } }).sort({ createdAt: 1 });
    console.log(`Found ${users.length} users needing an employeeId.`);

    let count = await User.countDocuments({ employeeId: { $ne: null } });

    for (const user of users) {
      count++;
      user.employeeId = `EMP-${String(count).padStart(4, '0')}`;
      await user.save();
      console.log(`Assigned ${user.employeeId} to user ${user.email}`);
    }

    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

migrateEmployeeIds();

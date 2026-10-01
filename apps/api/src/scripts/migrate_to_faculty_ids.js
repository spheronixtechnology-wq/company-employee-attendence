require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const users = await User.find({ employeeId: { $regex: /^EMP-/ } });
    console.log(`Found ${users.length} users to migrate.`);

    let updatedCount = 0;
    for (const user of users) {
      const oldId = user.employeeId;
      const newId = oldId.replace('EMP-', 'FACULTY-');
      
      user.employeeId = newId;
      await user.save();
      console.log(`Migrated ${user.email}: ${oldId} -> ${newId}`);
      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} users.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB');
  }
}

migrate();

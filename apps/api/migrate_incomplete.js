require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('./src/models/Attendance');
const connectDB = require('./src/config/db');

const migrateIncompleteStatus = async () => {
  try {
    await connectDB();
    
    // Find all incomplete records
    const records = await Attendance.find({ status: 'incomplete' });
    console.log(`Found ${records.length} records with status 'incomplete'.`);
    
    // Update them to 'present'
    const result = await Attendance.updateMany(
      { status: 'incomplete' },
      { $set: { status: 'present' } }
    );
    
    console.log(`Successfully migrated ${result.modifiedCount} records to 'present'.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateIncompleteStatus();

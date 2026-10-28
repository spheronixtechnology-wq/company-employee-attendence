/**
 * Track C Migration: Backfill Attendance Timestamps & Ensure Compound Indexes
 *
 * Imputes legacy records missing createdAt or updatedAt from checkInTime or date.
 * Ensures { updatedAt: 1, _id: 1 } and { userId: 1, date: 1 } indexes exist.
 */
const mongoose = require('mongoose');

async function migrateAttendanceTimestamps() {
  const db = mongoose.connection.db;
  const collection = db.collection('attendances');

  // Step 1: Check and backfill missing timestamps
  const cursor = collection.find({
    $or: [
      { createdAt: { $exists: false } },
      { updatedAt: { $exists: false } },
    ],
  });

  let backfilledCount = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const fallbackDate = doc.checkInTime || (doc.date ? new Date(`${doc.date}T00:00:00.000Z`) : new Date());

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          createdAt: doc.createdAt || fallbackDate,
          updatedAt: doc.updatedAt || fallbackDate,
        },
      }
    );
    backfilledCount++;
  }

  // Step 2: Ensure compound indexes exist
  const existingIndexes = await collection.indexes();
  const indexNames = existingIndexes.map((idx) => idx.name);

  if (!indexNames.includes('updatedAt_1__id_1')) {
    await collection.createIndex({ updatedAt: 1, _id: 1 }, { name: 'updatedAt_1__id_1' });
  }

  if (!indexNames.includes('userId_1_date_1')) {
    await collection.createIndex({ userId: 1, date: 1 }, { name: 'userId_1_date_1' });
  }

  return { backfilledCount };
}

module.exports = { migrateAttendanceTimestamps };

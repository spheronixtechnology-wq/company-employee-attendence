const mongoose = require('mongoose');

/**
 * Backdates documents by updating updatedAt and createdAt directly on the underlying MongoDB collection,
 * bypassing Mongoose schema timestamps hooks.
 * 
 * @param {import('mongoose').Model} Model - Mongoose model
 * @param {Array<mongoose.Types.ObjectId|string>} ids - Document IDs
 * @param {number} msAgo - Milliseconds in the past (default: 5 minutes)
 */
async function backdate(Model, ids, msAgo = 5 * 60 * 1000) {
  if (!ids || ids.length === 0) return;
  const targetDate = new Date(Date.now() - msAgo);
  const objectIds = ids.map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))));
  await Model.collection.updateMany(
    { _id: { $in: objectIds } },
    { $set: { updatedAt: targetDate, createdAt: targetDate } }
  );
}

module.exports = { backdate };

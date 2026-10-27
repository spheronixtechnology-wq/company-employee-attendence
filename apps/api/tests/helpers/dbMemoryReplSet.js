/**
 * In-Memory MongoDB Replica Set Test Helper
 * Provides a transactional MongoDB environment for integration tests using MongoMemoryReplSet.
 */

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replSet = null;

/**
 * Starts an in-memory MongoDB replica set and connects Mongoose.
 * @returns {Promise<string>} Connection URI
 */
const startReplSet = async () => {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
    return uri;
  }
  return replSet.getUri();
};

/**
 * Disconnects Mongoose and stops the in-memory replica set.
 */
const stopReplSet = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop({ doCleanup: true, force: true });
    replSet = null;
  }
};

/**
 * Clears all documents from all collections between test cases.
 */
const clearDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};

module.exports = {
  startReplSet,
  stopReplSet,
  clearDatabase,
};

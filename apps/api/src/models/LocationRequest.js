const mongoose = require('mongoose');

const locationRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'pending' },
  requestType: { type: String, default: 'temporary_access' },
  requestedUntil: { type: Date },
});

module.exports = mongoose.model('LocationRequest', locationRequestSchema);

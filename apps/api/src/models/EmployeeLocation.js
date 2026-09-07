const mongoose = require('mongoose');

const employeeLocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignmentType: { type: String, default: 'permanent' },
  status: { type: String, default: 'active' },
  validUntil: { type: Date },
});

module.exports = mongoose.model('EmployeeLocation', employeeLocationSchema);

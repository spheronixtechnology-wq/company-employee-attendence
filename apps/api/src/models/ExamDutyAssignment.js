const mongoose = require('mongoose');

const responseHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['ACCEPTED', 'REJECTED'], required: true },
  reason: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const examDutyAssignmentSchema = new mongoose.Schema({
  examDutyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamDuty', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true }, // 'hod', 'faculty'
  dutyType: { type: String, required: true },
  
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'REASSIGNED'],
    default: 'PENDING'
  },
  
  assignedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
  
  responseHistory: [responseHistorySchema],

  presenceStatus: {
    type: String,
    enum: ['PENDING', 'REPORTED', 'ABSENT'],
    default: 'PENDING'
  },
  reportedAt: { type: Date },
  completedAt: { type: Date }
}, {
  timestamps: true
});

examDutyAssignmentSchema.index({ examDutyId: 1 });
examDutyAssignmentSchema.index({ userId: 1 });
examDutyAssignmentSchema.index({ status: 1 });
examDutyAssignmentSchema.index({ presenceStatus: 1 });

module.exports = mongoose.model('ExamDutyAssignment', examDutyAssignmentSchema);

const mongoose = require('mongoose');

const examDutySchema = new mongoose.Schema({
  examName: { type: String, required: true },
  examType: { type: String, required: true },
  subject: { type: String, required: true },
  course: { type: String, required: true },
  semester: { type: String, required: true },
  date: { type: Date, required: true },
  session: { type: String, enum: ['Morning', 'Afternoon', 'Full Day'], required: true },
  
  reportingTime: { type: Date, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },

  location: {
    campus: { type: String, required: true },
    building: { type: String, required: true },
    room: { type: String, required: true }
  },
  
  instructions: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  status: { 
    type: String, 
    enum: ['DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT'
  },

  publishedAt: { type: Date },
  completedAt: { type: Date },
  cancelledAt: { type: Date }
}, {
  timestamps: true
});

examDutySchema.index({ date: 1 });
examDutySchema.index({ status: 1 });
examDutySchema.index({ createdBy: 1 });

module.exports = mongoose.model('ExamDuty', examDutySchema);

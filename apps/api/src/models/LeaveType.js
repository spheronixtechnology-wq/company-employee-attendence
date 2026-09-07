const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Leave type name is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Leave type name cannot exceed 50 characters'],
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [10, 'Code cannot exceed 10 characters'],
      // e.g. SL, CL, EL, UL
    },
    annualQuota: {
      type: Number,
      required: true,
      min: [0, 'Annual quota cannot be negative'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LeaveType', leaveTypeSchema);

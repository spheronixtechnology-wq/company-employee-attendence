const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    year: {
      type: Number,
      required: true,
      min: 2020,
    },
    allocated: {
      type: Number,
      required: true,
      min: 0,
    },
    used: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field — remaining balance
leaveBalanceSchema.virtual('remaining').get(function () {
  return Math.max(0, this.allocated - this.used);
});

// One balance document per user per leave type per year
leaveBalanceSchema.index({ userId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);

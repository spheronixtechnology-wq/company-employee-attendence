const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    leaveQuotas: {
      SL: { type: Number, default: null },
      CL: { type: Number, default: null },
      EL: { type: Number, default: null },
      UL: { type: Number, default: null },
    },
    leadUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // A team may temporarily have no manager
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

teamSchema.index({ isActive: 1 });

module.exports = mongoose.model('Team', teamSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never return password hash in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'manager', 'employee'],
        message: 'Role must be admin, manager, or employee',
      },
      required: true,
      default: 'employee',
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null, // Admin may have no team
    },
    joinedDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional profile fields
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    designation: {
      type: String,
      trim: true,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare plain password with hash
userSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Remove sensitive fields from JSON output
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

userSchema.index({ role: 1, teamId: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);

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
    middleName: { type: String, trim: true, default: null },
    lastName: { type: String, trim: true, default: null },
    dob: { type: Date, default: null },
    gender: { type: String, trim: true, default: null },
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
    department: { type: String, trim: true, default: null },
    designation: {
      type: String,
      trim: true,
      default: null,
    },
    jobType: { type: String, enum: ['Full-Time', 'Part-Time', 'Intern', 'Contract'], default: 'Full-Time' },
    workLocation: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    officeBranch: { type: String, trim: true, default: null },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    teamShift: { type: String, trim: true, default: null },
    joinedDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },
    // Optional profile fields
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    companyEmail: { type: String, trim: true, default: null },
    currentAddress: { type: String, trim: true, default: null },
    emergencyContactName: { type: String, trim: true, default: null },
    emergencyContactNumber: { type: String, trim: true, default: null },
    emergencyContactRelation: { type: String, trim: true, default: null },

    avatarUrl: {
      type: String,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Multi-Factor Authentication (MFA) fields
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String,
      select: false,
      default: null,
    },
    mfaPendingSecret: {
      type: String,
      select: false,
      default: null,
    },
    mfaPendingCreatedAt: {
      type: Date,
      select: false,
      default: null,
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
  delete obj.mfaSecret;
  delete obj.mfaPendingSecret;
  return obj;
};

userSchema.index({ role: 1, teamId: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ reportingManager: 1 });

module.exports = mongoose.model('User', userSchema);

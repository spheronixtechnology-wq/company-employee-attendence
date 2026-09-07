const mongoose = require('mongoose');

/**
 * OfficeLocation — defines an office location with geofence settings.
 * Replaces and extends the single-document GeofenceSetting model.
 * Multiple locations can be active simultaneously.
 * Employees are assigned to one or more locations via EmployeeLocation.
 */
const officeLocationSchema = new mongoose.Schema(
  {
    officeName: {
      type: String,
      required: [true, 'Office name is required'],
      trim: true,
      maxlength: [100, 'Office name cannot exceed 100 characters'],
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: -180,
      max: 180,
    },
    radiusMeters: {
      type: Number,
      required: [true, 'Radius in meters is required'],
      min: [10, 'Minimum radius is 10 meters'],
      max: [50000, 'Maximum radius is 50000 meters'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

officeLocationSchema.index({ status: 1 });

module.exports = mongoose.model('OfficeLocation', officeLocationSchema);

const mongoose = require('mongoose');

/**
 * GeofenceSetting — stores active office geofence.
 * Only one document should have isActive=true at any time.
 * Updated in-place with timestamp tracking (unlike attendance method settings).
 */
const geofenceSettingSchema = new mongoose.Schema(
  {
    officeName: {
      type: String,
      required: [true, 'Office name is required'],
      trim: true,
      maxlength: [100, 'Office name cannot exceed 100 characters'],
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
      max: [10000, 'Maximum radius is 10000 meters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  }
);

geofenceSettingSchema.index({ isActive: 1 });

module.exports = mongoose.model('GeofenceSetting', geofenceSettingSchema);

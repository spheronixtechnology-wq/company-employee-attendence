const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'leave_applied',
        'leave_approved',
        'leave_rejected',
        'leave_overridden',
        'attendance_override',
        'daily_log_reminder',
        'manual_attendance_submitted',
        'manual_attendance_approved',
        'manual_attendance_rejected',
        'device_approved',
        'device_rejected',
        'device_request_submitted',
        'device_unregistered_attempt',
        'location_request_submitted',
        'session_reactivated',
        'session_reactivation_rejected',
        'general',
      ],
      default: 'general',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // References the related document (leave request ID, attendance ID, etc.)
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

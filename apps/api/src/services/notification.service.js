const Notification = require('../models/Notification');
const { emitToUser } = require('../socket');

/**
 * Creates a notification for a user.
 * Silent — errors are caught and logged without throwing.
 */
const createNotification = async ({ userId, type = 'general', title, message, relatedId = null }) => {
  try {
    const notif = await Notification.create({ userId, type, title, message, relatedId });
    emitToUser(userId, 'notification:new', { notification: notif });
  } catch (err) {
    console.error('[NotificationService] Failed to create notification:', err.message);
  }
};

/**
 * Creates notifications for multiple users at once.
 */
const createBulkNotifications = async (notifications) => {
  try {
    const created = await Notification.insertMany(notifications, { ordered: false });
    for (const notif of created) {
      emitToUser(notif.userId, 'notification:new', { notification: notif });
    }
  } catch (err) {
    console.error('[NotificationService] Failed to create bulk notifications:', err.message);
  }
};

module.exports = { createNotification, createBulkNotifications };

const Notification = require('../models/Notification');

// Sends an in-app notification, saves it to Mongoose, and broadcasts via Socket.io
exports.sendNotification = async (appOrIo, userId, title, message, type = 'INFO') => {
  try {
    const notif = await Notification.create({
      userId,
      title,
      message,
      type
    });

    // Check if we passed the Express app or Socket.io server directly
    const io = appOrIo && typeof appOrIo.get === 'function' ? appOrIo.get('io') : appOrIo;

    if (io) {
      io.to(`user:${userId}`).emit('NEW_NOTIFICATION', notif);
    }
    return notif;
  } catch (err) {
    console.error('Failed to send notification:', err.message);
  }
};

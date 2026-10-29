// Persist updates before live delivery; email is best effort and never logs tokens.
import { sendPlainEmail } from '../lib/mail.js';
import { Notification } from '../models/Notification.js';
import { emitNotification } from './realtime.js';
let mailConfig;
export const configureNotifications = (config) => {
  mailConfig = config;
};
export async function sendNotification(userId, type, message) {
  const n = await Notification.create({ user: userId, type, message });
  emitNotification(userId, { id: n._id, type, message });
  await sendPlainEmail(userId, message, mailConfig);
  return n;
}

export const notificationConfig = () => mailConfig;

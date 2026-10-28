// Persist updates before live delivery; email is best effort and never logs tokens.
import nodemailer from 'nodemailer';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { hasKey } from '../config/env.js';
import { emitNotification } from './realtime.js';
import { logger } from '../lib/logger.js';
let mailConfig;
export const configureNotifications = (config) => {
  mailConfig = config;
};
export async function sendNotification(userId, type, message) {
  const n = await Notification.create({ user: userId, type, message });
  emitNotification(userId, { id: n._id, type, message });
  const c = mailConfig;
  if (c && [c.SMTP_HOST, c.SMTP_USER, c.SMTP_PASS].every(hasKey)) {
    const user = await User.findOne({ _id: userId, deletedAt: null })
      .select('email')
      .lean();
    if (user)
      try {
        await nodemailer
          .createTransport({
            host: c.SMTP_HOST,
            port: c.SMTP_PORT,
            secure: c.SMTP_PORT === 465,
            auth: { user: c.SMTP_USER, pass: c.SMTP_PASS },
            connectionTimeout: 10000,
          })
          .sendMail({
            from: c.EMAIL_FROM,
            to: user.email,
            subject: 'ReplateAI update',
            text: message,
          });
      } catch {
        logger.warn('Notification email not delivered');
      }
  }
  return n;
}

export const notificationConfig = () => mailConfig;

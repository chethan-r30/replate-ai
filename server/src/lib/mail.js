// Missing SMTP never masquerades as delivery. Dev inbox is in memory, not logs.
import nodemailer from 'nodemailer';
import { hasKey } from '../config/env.js';
import { logger } from './logger.js';
const devInbox = new Map();
export const readDevInbox = (email) => devInbox.get(email) || [];
export async function sendActionEmail(user, type, token, config) {
  const url = new URL(
    type === 'verify' ? '/verify-email' : '/reset-password',
    config.CLIENT_URL,
  );
  url.searchParams.set('token', token);
  const message = {
    to: user.email,
    from: config.EMAIL_FROM,
    subject:
      type === 'verify'
        ? 'Verify your ReplateAI email'
        : 'Reset your ReplateAI password',
    text: `Open this link: ${url.toString()}\nIf you did not request it, ignore this email.`,
  };
  if (
    !hasKey(config.SMTP_HOST) ||
    !hasKey(config.SMTP_USER) ||
    !hasKey(config.SMTP_PASS)
  ) {
    if (config.NODE_ENV !== 'production') {
      devInbox.set(user.email, [
        ...readDevInbox(user.email).slice(-9),
        { type, url: url.toString() },
      ]);
    }
    logger.warn('SMTP unavailable; action email was not delivered');
    return false;
  }
  try {
    await nodemailer
      .createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        connectionTimeout: 10000,
      })
      .sendMail(message);
    return true;
  } catch {
    logger.warn('SMTP delivery failed');
    return false;
  }
}

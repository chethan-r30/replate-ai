// Missing SMTP never masquerades as delivery. Dev inbox is in memory, not logs.
import nodemailer from 'nodemailer';
import { hasKey } from '../config/env.js';
import { logger } from './logger.js';
const devInbox = new Map();
export const clearDevInbox = (email) => devInbox.delete(email);
export const readDevInbox = (email) => devInbox.get(email) || [];
export async function deliverEmail(message, config) {
  if (config?.EMAIL_PROVIDER === 'brevo') {
    if (!hasKey(config.BREVO_API_KEY) || !config.BREVO_SENDER_EMAIL)
      return false;
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'api-key': config.BREVO_API_KEY,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'ReplateAI', email: config.BREVO_SENDER_EMAIL },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
        }),
      });
      if (!response.ok) {
        logger.warn('Email provider rejected delivery');
        return false;
      }
      return true;
    } catch {
      logger.warn('Email provider unavailable');
      return false;
    }
  }
  if (
    !config ||
    ![config.SMTP_HOST, config.SMTP_USER, config.SMTP_PASS].every(hasKey)
  )
    return false;
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
  const sent = await deliverEmail(message, config);
  if (!sent && config.NODE_ENV !== 'production') {
    devInbox.set(user.email, [
      ...readDevInbox(user.email).slice(-9),
      { type, url: url.toString() },
    ]);
  }
  return sent;
}

// Notification delivery reuses the SMTP transport without exposing any action links.
export async function sendPlainEmail(userId, message, config) {
  if (!config) return false;
  const { User } = await import('../models/User.js');
  const user = await User.findOne({ _id: userId, deletedAt: null })
    .select('email')
    .lean();
  if (!user) return false;
  return deliverEmail(
    {
      from: config.EMAIL_FROM,
      to: user.email,
      subject: 'ReplateAI update',
      text: message,
    },
    config,
  );
}

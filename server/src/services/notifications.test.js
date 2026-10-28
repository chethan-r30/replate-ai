import { it, expect, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import {
  configureNotifications,
  sendNotification,
  notificationConfig,
} from './notifications.js';
afterEach(() => vi.restoreAllMocks());
it('persists even when email fails and uses safe transport options', async () => {
  const create = vi
    .spyOn(Notification, 'create')
    .mockResolvedValue({ _id: 'n' });
  const sendMail = vi.fn().mockResolvedValue({});
  const transport = vi
    .spyOn(nodemailer, 'createTransport')
    .mockReturnValue({ sendMail });
  vi.spyOn(User, 'findOne').mockReturnValue({
    select: () => ({ lean: async () => ({ email: 'test@example.com' }) }),
  });
  const c = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 465,
    SMTP_USER: 'user',
    SMTP_PASS: 'secret',
    EMAIL_FROM: 'noreply@example.com',
  };
  configureNotifications(c);
  expect(notificationConfig()).toBe(c);
  expect(await sendNotification('u', 'test', 'Message')).toEqual({ _id: 'n' });
  expect(create).toHaveBeenCalled();
  expect(transport.mock.calls[0][0].secure).toBe(true);
  expect(sendMail).toHaveBeenCalled();
  sendMail.mockRejectedValueOnce(new Error('down'));
  expect(await sendNotification('u', 'test', 'Still persists')).toEqual({
    _id: 'n',
  });
  configureNotifications({});
  await sendNotification('u', 'test', 'No SMTP');
  expect(sendMail).toHaveBeenCalledTimes(2);
});

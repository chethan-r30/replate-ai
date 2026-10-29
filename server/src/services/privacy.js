import { ProofUpload, UploadBudget } from '../models/ProofUpload.js';
import { disconnectUser } from './realtime.js';
import { clearDevInbox } from '../lib/mail.js';
// Erase account PII while preserving non-identifying food and pickup history.
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { FoodListing } from '../models/FoodListing.js';
import { Claim } from '../models/Claim.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ActionToken } from '../models/ActionToken.js';
import { Notification } from '../models/Notification.js';
import { Feedback } from '../models/Feedback.js';
import { clearCache } from './cache.js';
import { AppError } from '../middleware/errors.js';
export async function deleteAccount(user) {
  if (user.role === 'admin')
    throw new AppError(
      403,
      'Admin account deletion needs a separate administrator transfer',
    );
  await mongoose.connection.transaction(async () => {
    const org = await Organization.findOne({ owner: user._id });
    if (
      org &&
      (await Claim.exists({
        $or: [{ ngo: org._id }, { restaurant: org._id }],
        status: { $in: ['requested', 'approved'] },
      }))
    )
      throw new AppError(
        409,
        'Complete or cancel active handovers before deleting your account',
      );
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          name: 'Deleted account',
          email: `deleted-${user._id}@invalid.example`,
          passwordHash: 'deleted',
          deletedAt: new Date(),
          isEmailVerified: false,
          verificationStatus: 'rejected',
          phone: '',
          avatar: '',
        },
        $unset: { lockedUntil: 1 },
      },
    );
    if (org) {
      await Organization.updateOne(
        { _id: org._id },
        {
          $set: {
            name: 'Deleted organization',
            registrationNo: 'deleted',
            address: 'deleted',
            verificationDocs: [],
            verificationStatus: 'rejected',
            capacity: 0,
            location: { type: 'Point', coordinates: [0, 0] },
          },
        },
      );
      await FoodListing.updateMany(
        { restaurant: org._id },
        {
          $set: {
            title: 'Removed listing',
            description: '',
            photos: [],
            location: { type: 'Point', coordinates: [0, 0] },
            aiMeta: {},
          },
        },
      );
      await FoodListing.updateMany(
        { restaurant: org._id, status: 'available' },
        { $set: { status: 'cancelled' } },
      );
      await Feedback.updateMany(
        { $or: [{ from: user._id }, { to: org._id }] },
        { $unset: { comment: 1 } },
      );
    }
    const assets = await ProofUpload.find({ owner: user._id })
      .select('size')
      .lean();
    const released = assets.reduce((sum, asset) => sum + asset.size, 0);
    await ProofUpload.deleteMany({ owner: user._id });
    if (released)
      await UploadBudget.updateMany(
        { _id: { $in: ['global', `owner:${user._id}`] } },
        { $inc: { used: -released, count: -assets.length } },
      );
    await RefreshToken.deleteMany({ user: user._id });
    await ActionToken.deleteMany({ user: user._id });
    await Notification.deleteMany({ user: user._id });
  });
  disconnectUser(user._id);
  clearDevInbox(user.email);
  clearCache();
}

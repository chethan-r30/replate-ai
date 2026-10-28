// Expire listings without deleting history or claim evidence.
import mongoose from 'mongoose';
import cron from 'node-cron';
import { Organization } from '../models/Organization.js';
import { sendNotification } from '../services/notifications.js';
import { notifyMatches } from '../services/matching.js';
import { FoodListing } from '../models/FoodListing.js';
import { Claim } from '../models/Claim.js';
import { logger } from '../lib/logger.js';
export async function expireListings() {
  const ids = await FoodListing.find({
    status: { $in: ['available', 'reserved'] },
    $or: [
      { bestBefore: { $lte: new Date() } },
      { 'pickupWindow.end': { $lte: new Date() } },
    ],
  })
    .select('_id')
    .limit(500)
    .lean();
  let count = 0;
  for (const { _id } of ids) {
    count += await mongoose.connection.transaction(async () => {
      const listing = await FoodListing.findOneAndUpdate(
        {
          _id,
          status: { $in: ['available', 'reserved'] },
          $or: [
            { bestBefore: { $lte: new Date() } },
            { 'pickupWindow.end': { $lte: new Date() } },
          ],
        },
        { $set: { status: 'expired' } },
        { new: false },
      );
      if (!listing) return 0;
      if (listing.activeClaim)
        await Claim.updateOne(
          {
            _id: listing.activeClaim,
            status: { $in: ['requested', 'approved'] },
          },
          { $set: { status: 'no_show' } },
        );
      return 1;
    });
  }
  return count;
}

export async function escalateMatches() {
  const listings = await FoodListing.find({
    status: 'available',
    bestBefore: { $gt: new Date() },
    $or: [
      { lastNotifiedAt: { $lte: new Date(Date.now() - 900000) } },
      { lastNotifiedAt: null },
    ],
  })
    .select('_id')
    .limit(100)
    .lean();
  for (const listing of listings) await notifyMatches(listing._id);
}
export async function remindExpiring() {
  const listings = await FoodListing.find({
    status: { $in: ['available', 'reserved'] },
    bestBefore: { $gt: new Date(), $lte: new Date(Date.now() + 1800000) },
    expiryReminderAt: null,
  })
    .select('_id restaurant title')
    .limit(100)
    .lean();
  for (const listing of listings) {
    const changed = await FoodListing.updateOne(
      { _id: listing._id, expiryReminderAt: null },
      { $set: { expiryReminderAt: new Date() } },
    );
    if (changed.modifiedCount) {
      const org = await Organization.findById(listing.restaurant).select(
        'owner',
      );
      if (org)
        await sendNotification(
          org.owner,
          'expiry-reminder',
          `Food deadline is approaching for ${listing.title}. Never hand over food past its safe deadline.`,
        );
    }
  }
}
export function startExpiryJob() {
  return cron.schedule('* * * * *', () =>
    Promise.all([expireListings(), escalateMatches(), remindExpiring()]).catch(
      () => logger.error('Expiry job failed'),
    ),
  );
}

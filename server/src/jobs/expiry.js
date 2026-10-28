// Expire listings without deleting history or claim evidence.
import cron from 'node-cron';
import { Organization } from '../models/Organization.js';
import { sendNotification } from '../services/notifications.js';
import { notifyMatches } from '../services/matching.js';
import { FoodListing } from '../models/FoodListing.js';
import { Claim } from '../models/Claim.js';
import { logger } from '../lib/logger.js';
export async function expireListings() {
  const expired = await FoodListing.find({
    status: { $in: ['available', 'reserved'] },
    $or: [
      { bestBefore: { $lte: new Date() } },
      { 'pickupWindow.end': { $lte: new Date() } },
    ],
  })
    .select('_id activeClaim')
    .lean();
  if (!expired.length) return 0;
  await FoodListing.updateMany(
    {
      _id: { $in: expired.map((x) => x._id) },
      status: { $in: ['available', 'reserved'] },
    },
    { $set: { status: 'expired' } },
  );
  await Claim.updateMany(
    {
      _id: { $in: expired.map((x) => x.activeClaim).filter(Boolean) },
      status: { $in: ['requested', 'approved'] },
    },
    { $set: { status: 'no_show' } },
  );
  return expired.length;
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

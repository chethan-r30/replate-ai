// Expire listings without deleting history or claim evidence.
import cron from 'node-cron';
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
export function startExpiryJob() {
  return cron.schedule('* * * * *', () =>
    Promise.all([expireListings(), escalateMatches()]).catch(() =>
      logger.error('Expiry job failed'),
    ),
  );
}

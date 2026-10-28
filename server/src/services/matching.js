// Query nearby approved NGOs and subtract today's allocated capacity.
import mongoose from 'mongoose';
import { sendPlainEmail } from '../lib/mail.js';
import { notificationConfig } from './notifications.js';
import { emitNotification } from './realtime.js';
import { Organization } from '../models/Organization.js';
import { Claim } from '../models/Claim.js';
import { FoodListing } from '../models/FoodListing.js';
import { Notification } from '../models/Notification.js';
import { rankMatches } from '../ai/match.js';
export async function recommendations(
  listing,
  { radius = 10000, limit = 10 } = {},
) {
  const candidates = await Organization.aggregate([
    {
      $geoNear: {
        near: listing.location,
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: radius,
        query: { type: 'ngo', verificationStatus: 'approved' },
      },
    },
    { $limit: 200 },
  ]);
  if (!candidates.length) return [];
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const totals = await Claim.aggregate([
    {
      $match: {
        ngo: { $in: candidates.map((x) => x._id) },
        createdAt: { $gte: day },
        status: { $in: ['requested', 'approved', 'picked_up'] },
      },
    },
    {
      $lookup: {
        from: 'foodlistings',
        localField: 'listing',
        foreignField: '_id',
        as: 'food',
      },
    },
    { $unwind: '$food' },
    { $group: { _id: '$ngo', servings: { $sum: '$food.servings' } } },
  ]);
  const used = new Map(totals.map((x) => [String(x._id), x.servings]));
  return rankMatches(
    listing,
    candidates.map((x) => ({
      ...x,
      claimedToday: used.get(String(x._id)) || 0,
    })),
    { radiusMeters: radius, limit },
  );
}
export async function notifyMatches(listingId) {
  const delivered = [];
  const count = await mongoose.connection.transaction(async () => {
    const listing = await FoodListing.findOne({
      _id: listingId,
      status: 'available',
      bestBefore: { $gt: new Date() },
    });
    if (!listing) return 0;
    const matches = await recommendations(listing, { limit: 100 });
    const next = matches
      .filter(
        (x) => !listing.notifiedOrgs.some((id) => String(id) === String(x._id)),
      )
      .slice(0, 3);
    if (!next.length) return 0;
    const changed = await FoodListing.updateOne(
      { _id: listing._id, updatedAt: listing.updatedAt },
      {
        $addToSet: { notifiedOrgs: { $each: next.map((x) => x._id) } },
        $set: { lastNotifiedAt: new Date() },
      },
    );
    if (!changed.modifiedCount) return 0;
    await Notification.insertMany(
      next.map((x) => ({
        user: x.owner,
        type: 'nearby-listing',
        message: `Nearby surplus: ${listing.title}. Review the pickup window before claiming.`,
      })),
    );
    delivered.push(...next);
    return next.length;
  });
  for (const org of delivered) {
    emitNotification(org.owner, { type: 'nearby-listing' });
    await sendPlainEmail(
      org.owner,
      'Nearby surplus is available. Review your ReplateAI notifications and the food pickup window.',
      notificationConfig(),
    );
  }
  return count;
}
